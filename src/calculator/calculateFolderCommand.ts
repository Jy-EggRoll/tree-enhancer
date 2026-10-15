import * as vscode from "vscode";
import { getLogger } from "../utils/func";
import type { FolderCalculationResult } from "../types";

const log = getLogger();
import {
  FolderCalculator,
  CalculationCancelledError,
} from "./folderCalculator";
import { Formatters } from "../utils/formatters";
import { StatusBarManager } from "../statusBarManager";

/**
 * 文件夹计算命令处理器
 */
export class CalculateFolderCommand {
  private statusBarManager: StatusBarManager;
  private isCalculating = false;
  private hasResult = false;
  /** 最近一次计算结果的缓存，供配置热加载后按最新模板重新渲染 */
  private lastResult?: FolderCalculationResult;
  /** 当前正在进行的计算的取消源；无计算进行时为 undefined */
  private currentRun?: vscode.CancellationTokenSource;
  /**
   * 运行序号，每发起一次计算递增。
   * 只允许序号等于最新值的那次运行写入状态栏与状态位：取消可能恰好晚于
   * 计算完成（此时结果已算出但用户已经不要了），另一路也可能已有更新的运行接管。
   */
  private runId = 0;

  constructor(statusBarManager: StatusBarManager) {
    this.statusBarManager = statusBarManager;
  }

  public get isRunning(): boolean {
    return this.isCalculating;
  }

  /**
   * 取消当前计算。
   * 取消令牌只会让正在进行的运行尽快抛错退出，状态栏与状态位在此同步复位；
   * 取消源本身留待该运行的 finally 统一释放，避免释放时机早于最后一次令牌读取。
   */
  public cancel(): void {
    if (this.isCalculating) {
      this.currentRun?.cancel();
      this.statusBarManager.hide();
      this.isCalculating = false;
      log.debug(
        vscode.l10n.t(
          "[Calculate Folder Command] Calculation cancelled by user",
        ),
      );
    }
  }

  /**
   * 重新开始计算（从选中项）。
   * 注意：命令必须携带目标文件夹 uri 调用（右键菜单来源），不再支持无参快捷键触发。
   */
  public async execute(uri?: vscode.Uri): Promise<void> {
    // 上一次计算若仍在进行，先真正取消掉再开始新的。
    // 旧实现只是置一个静态标志位，紧接着又被复位，于是被"取消"的运行继续跑完
    // 并与新运行叠加：实测峰值在途与堆占用都翻倍，双击右键菜单即可复现。
    this.cancel();

    if (this.hasResult) {
      this.statusBarManager.hide();
      this.hasResult = false;
      log.debug(
        vscode.l10n.t(
          "[Calculate Folder Command] Result dismissed, starting new calculation",
        ),
      );
    }

    if (!uri) {
      // 无目标 uri（例如从命令面板手动触发）时无法确定要计算哪个文件夹，直接放弃。
      // 曾支持过 alt+enter 快捷键无参触发，依赖下方被注释的剪贴板中转方案，现已移除。
      return;
    }

    const run = new vscode.CancellationTokenSource();
    this.currentRun = run;
    const runId = ++this.runId;
    this.isCalculating = true;

    await this.calculateFolder(uri, run, runId);
  }

  /**
   * 计算文件夹信息
   */
  private async calculateFolder(
    folderUri: vscode.Uri,
    run: vscode.CancellationTokenSource,
    runId: number,
  ): Promise<void> {
    const folderName = folderUri.path.split("/").pop() || folderUri.path;
    this.statusBarManager.showCalculating(folderName);

    try {
      const result = await FolderCalculator.calculate(folderUri, run.token);

      if (runId !== this.runId) {
        log.debug(
          vscode.l10n.t(
            "[Calculate Folder Command] Calculation cancelled, result discarded",
          ),
        );
        return;
      }

      this.showResult(result);
      this.hasResult = true;
    } catch (error) {
      if (error instanceof CalculationCancelledError) {
        log.debug(
          vscode.l10n.t(
            "[Calculate Folder Command] Calculation cancelled, result discarded",
          ),
        );
        return;
      }
      log.error(
        vscode.l10n.t(
          "[Calculate Folder Command] Calculation failed: {0}",
          error instanceof Error ? error.message : String(error),
        ),
      );
      if (runId === this.runId) {
        this.statusBarManager.hide();
      }
    } finally {
      // 只有最新一次运行才有资格收尾状态位。陈旧运行若在这里复位，会把正在进行
      // 的新运行误标为"已结束"，此后点击状态栏只会隐藏结果，无法再取消计算。
      if (runId === this.runId) {
        this.isCalculating = false;
        this.currentRun = undefined;
      }
      run.dispose();
    }
  }

  /**
   * 奇技淫巧 已停用
   * 但是该代码确实是有效果的，所以保留这段注释
   * 剪贴板中转方案：利用官方 "copyFilePath" 命令间接获取“资源管理器当前选中项”的路径。
   *
   * 说明：
   * 1. 仅在 Windows 上经过完善测试确认无副作用（不会污染剪贴板）。
   * 2. 不推荐作为常规写法：依赖剪贴板状态与 VSCode 内部命令的行为细节，
   *    一旦 VSCode 官方调整 "copyFilePath" 或剪贴板 API，极易产生难以排查的竞态问题。
   *
   * 曾用于支持 alt+enter 快捷键无参触发命令（已随该功能一并移除）。
   */
  // private async getUriSpecial(): Promise<vscode.Uri | undefined> {
  //     const originalClipboard = await vscode.env.clipboard.readText();
  //     await vscode.commands.executeCommand("copyFilePath");
  //     const copiedPath = await vscode.env.clipboard.readText();
  //     await vscode.env.clipboard.writeText(originalClipboard); // 恢复原始剪贴板内容
  //
  //     if (copiedPath && copiedPath !== originalClipboard) {
  //         return vscode.Uri.file(copiedPath);
  //     }
  //
  //     return undefined;
  // }

  /**
   * 显示计算结果
   */
  private showResult(result: FolderCalculationResult): void {
    this.lastResult = result;
    const statusText = Formatters.formatForStatusBar(result);
    this.statusBarManager.showFolderResult(statusText);

    log.debug(vscode.l10n.t("[Calculate Folder Command] Result displayed"));
  }

  /**
   * 配置热加载后重新渲染当前结果显示（若存在）。
   * 由 extension.ts 集中式配置监听在 statusBarTemplate / fileSizeBase 变化时调用，
   * 使正在显示的结果立即按最新模板刷新，无需重启或重新计算。
   */
  public refreshDisplay(): void {
    if (this.hasResult && this.lastResult) {
      this.showResult(this.lastResult);
    }
  }

  /**
   * 隐藏状态栏（外部调用，例如 dismiss 命令）
   */
  public hideStatusBar(): void {
    this.statusBarManager.hide();
    this.hasResult = false;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    // StatusBarManager 由 extension.ts 统一管理
  }
}
