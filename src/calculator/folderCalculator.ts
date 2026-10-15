import * as vscode from "vscode";
import { getLogger } from "../utils/func";

const log = getLogger();
import { FolderCalculationResult } from "../types";

export class CalculationCancelledError extends Error {
  constructor() {
    super("Calculation cancelled");
    this.name = "CalculationCancelledError";
  }
}

/**
 * 单次文件系统调用的并发上限。
 *
 * 为什么必须有上限：此前每个目录都对"全部子目录 + 全部文件"同时发起 Promise.all，
 * 在途调用数等于整棵树的节点数，没有任何上限。实测十万级文件时在途达 6.5 万、
 * JS 堆 215MB，四十万级时在途 26 万、堆 752MB，百万级时堆耗尽、进程被系统杀掉，
 * 用户看到的是"扩展主机意外终止并重启"（VSCode 对 OOM 与被信号杀掉没有专属提示，
 * 文案与普通崩溃相同）。堆耗尽之前 GC 会先进入无效回收，表现为计算长时间不返回。
 *
 * 取值依据：本地 file: 方案下每次调用都要经扩展主机↔主进程的 IPC 往返，而两端
 * 真正的磁盘操作走 libuv 线程池（默认 4 线程）。取 16 既能让 IPC 管道保持充盈、
 * 掩盖往返延迟，又不会在主进程侧堆积出长队列。
 *
 * 刻意不做成配置项：它只影响吞吐与内存的折中，没有需要用户按场景区分的语义，
 * 暴露出去只会增加理解成本与长期的兼容负担。
 */
const MAX_CONCURRENCY = 16;

/**
 * 一次遍历的全部可变状态。
 * 随运行结束一并释放，不放在类静态字段上——静态字段无法区分"哪一次运行"，
 * 上一次运行的取消标志会被下一次运行的复位操作清掉，导致被取消的运行继续跑完
 * 并与新运行叠加（实测重复触发会让峰值在途与堆占用都翻倍）。
 */
interface WalkState {
  readonly token?: vscode.CancellationToken;
  /** 已派发但尚未完成的任务数，归零即整棵树遍历完毕 */
  pending: number;
  /** 待读取的目录（后进先出，使遍历近似深度优先，队列不会随树宽膨胀） */
  dirQueue: vscode.Uri[];
  /** 待 stat 的文件（同上） */
  fileQueue: vscode.Uri[];
  /** 当前在途的文件系统调用数，仅用于诊断 */
  inFlight: number;
  peakInFlight: number;
  /** 因暂时无任务可取而等待的 worker 的唤醒回调 */
  waiters: Array<() => void>;
  totalSize: number;
  fileCount: number;
  folderCount: number;
}

export class FolderCalculator {
  /**
   * 计算文件夹占用空间。
   *
   * 取消通过传入的 token 表达，而不是类上的静态标志位：
   * 静态标志位没有"运行"这一层概念，无法阻止新运行把旧运行的取消状态清掉。
   */
  public static async calculate(
    folderUri: vscode.Uri,
    token?: vscode.CancellationToken,
  ): Promise<FolderCalculationResult> {
    const startTime = Date.now();
    this.throwIfCancelled(token);
    const folderName = folderUri.path.split("/").pop() || folderUri.path;
    const folderStat = await vscode.workspace.fs.stat(folderUri);

    const state: WalkState = {
      token,
      pending: 0,
      dirQueue: [],
      fileQueue: [],
      inFlight: 0,
      peakInFlight: 0,
      waiters: [],
      totalSize: 0,
      fileCount: 0,
      folderCount: 0,
    };

    // 根目录单独读一次，不交给 worker：根目录读不了属于入口级失败，
    // 必须向上抛出让调用方报错，而不是被 worker 吞成"空文件夹、0 字节"。
    const rootEntries = await this.callFs(state, () =>
      vscode.workspace.fs.readDirectory(folderUri),
    );
    this.dispatch(state, folderUri, rootEntries);

    // 固定数量的 worker 从队列拉取任务：在途调用数因此恒等于 worker 数，
    // 与树的规模无关。队列里只保留"已发现但尚未处理"的任务。
    const workers = Array.from({ length: MAX_CONCURRENCY }, () =>
      this.worker(state),
    );
    await Promise.all(workers);

    const duration = Date.now() - startTime;
    log.debug(
      vscode.l10n.t(
        "[Folder Calculator] Calculation {0} completed in {1}ms: {2} files, {3} folders, {4} bytes",
        folderName,
        duration,
        state.fileCount,
        state.folderCount,
        state.totalSize,
      ),
    );

    log.debug(
      vscode.l10n.t(
        "[Folder Calculator] Max concurrency: {0}",
        state.peakInFlight,
      ),
    );

    return {
      folderName,
      totalSize: state.totalSize,
      fileCount: state.fileCount,
      folderCount: state.folderCount,
      modifiedTime: folderStat.mtime,
    };
  }

  /**
   * worker 主循环：反复从队列取一个任务执行，无任务可取而仍有任务在外时挂起等待。
   * 退出条件是"队列空且 pending 归零"，即整棵树遍历完毕。
   */
  private static async worker(state: WalkState): Promise<void> {
    try {
      for (;;) {
        this.throwIfCancelled(state.token);

        // 先取文件再取目录，这个顺序是内存上的关键：读一个目录会一次性带出它的
        // 全部子项，若优先继续读目录，已发现却未 stat 的文件就会在队列里越堆越多，
        // 内存重新变成随目录规模上涨。先消化已发现的工作，再发现新的。
        const file = state.fileQueue.pop();
        if (file !== undefined) {
          await this.statFile(file, state);
          continue;
        }

        const dir = state.dirQueue.pop();
        if (dir !== undefined) {
          await this.readDirectory(dir, state);
          continue;
        }

        if (state.pending <= 0) {
          return;
        }
        await this.waitForTask(state);
      }
    } catch (error) {
      // 异常退出时必须唤醒仍在等待的同伴，否则它们永远等不到任务：
      // 那些悬挂的 promise 会一直持有 state，既泄漏内存，也会让在途统计失真。
      this.wakeAll(state);
      throw error;
    }
  }

  /** 读取一个目录，把其中的子目录与文件派发到队列 */
  private static async readDirectory(
    uri: vscode.Uri,
    state: WalkState,
  ): Promise<void> {
    try {
      const entries = await this.callFs(state, () =>
        vscode.workspace.fs.readDirectory(uri),
      );
      this.dispatch(state, uri, entries);
    } catch (error) {
      if (error instanceof CalculationCancelledError) {
        throw error;
      }
      log.warn(
        vscode.l10n.t(
          "[Folder Calculator] Failed to access directory: {0}, error: {1}",
          uri.fsPath,
          error instanceof Error ? error.message : String(error),
        ),
      );
    } finally {
      this.completeTask(state);
    }
  }

  /** stat 一个文件并累加结果 */
  private static async statFile(
    uri: vscode.Uri,
    state: WalkState,
  ): Promise<void> {
    try {
      const stat = await this.callFs(state, () =>
        vscode.workspace.fs.stat(uri),
      );
      state.totalSize += stat.size;
      state.fileCount++;
    } catch (error) {
      if (error instanceof CalculationCancelledError) {
        throw error;
      }
      // 只记日志，不计入大小与数量。此前实现让失败的 stat 返回 -1 并加入总和，
      // 结果是每个读不到的文件反而让总大小少 1 字节。
      log.warn(
        vscode.l10n.t(
          "[Folder Calculator] Failed to access file: {0}, error: {1}",
          uri.fsPath,
          error instanceof Error ? error.message : String(error),
        ),
      );
    } finally {
      this.completeTask(state);
    }
  }

  /** 把一个目录的子项派发成待办任务 */
  private static dispatch(
    state: WalkState,
    uri: vscode.Uri,
    entries: [string, vscode.FileType][],
  ): void {
    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(uri, name);
      // 这里刻意用严格相等而不是位运算：readDirectory 对符号链接返回
      // "目标类型 | SymbolicLink" 的位掩码（符号链接目录为 66），严格相等因此
      // 把符号链接一并排除在统计之外。若改成位运算，符号链接目录会被跟进，
      // 环形链接会让遍历永不结束——这是本功能能安全跑在任意目录上的前提。
      if (type === vscode.FileType.Directory) {
        state.folderCount++;
        state.dirQueue.push(entryUri);
        state.pending++;
      } else if (type === vscode.FileType.File) {
        state.fileQueue.push(entryUri);
        state.pending++;
      }
    }
  }

  /**
   * 统一包裹文件系统调用：先查取消，再计入在途。
   * 取消检查放在每次调用之前，因此取消的生效延迟不超过一个调用，
   * 而不是要等整个扇出自然结束（旧实现取消后仍需继续烧掉数百毫秒）。
   */
  private static async callFs<T>(
    state: WalkState,
    call: () => Thenable<T>,
  ): Promise<T> {
    this.throwIfCancelled(state.token);
    state.inFlight++;
    if (state.inFlight > state.peakInFlight) {
      state.peakInFlight = state.inFlight;
    }
    try {
      return await call();
    } finally {
      state.inFlight--;
    }
  }

  /**
   * 收尾一个任务并唤醒等待者。
   * 唤醒条件：还有任务可取（队列非空），或整棵树已遍历完毕（pending 已归零）。
   * 两者都不满足时无人可被唤醒，说明其余 worker 都在处理自己手上的任务，不必打扰。
   *
   * 判定用 `<= 0` 而不是精确相等：一旦将来记账出现多减，精确相等会让 pending 停在
   * -1、`completeTask` 再也不触发唤醒，全体 worker 永久挂起且 Promise.all 永不落定，
   * 症状是"计算永远不返回且没有任何错误"。用 `<= 0` 则只退化为提前结束，能查出来。
   */
  private static completeTask(state: WalkState): void {
    state.pending--;
    if (
      state.pending <= 0 ||
      state.dirQueue.length > 0 ||
      state.fileQueue.length > 0
    ) {
      this.wakeAll(state);
    }
  }

  private static waitForTask(state: WalkState): Promise<void> {
    return new Promise<void>((resolve) => state.waiters.push(resolve));
  }

  private static wakeAll(state: WalkState): void {
    if (state.waiters.length === 0) {
      return;
    }
    const waiters = state.waiters;
    state.waiters = [];
    for (const wake of waiters) {
      wake();
    }
  }

  private static throwIfCancelled(token?: vscode.CancellationToken): void {
    if (token?.isCancellationRequested) {
      throw new CalculationCancelledError();
    }
  }
}
