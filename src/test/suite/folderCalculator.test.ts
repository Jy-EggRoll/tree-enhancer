import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import * as vscode from "vscode";

import {
  FolderCalculator,
  CalculationCancelledError,
} from "../../calculator/folderCalculator";
import {
  __reset,
  __setVirtualFs,
  __setFsLatency,
  fsStats,
  VIRTUAL_FS_MTIME,
  type VirtualEntry,
} from "../vscodeStub";

/**
 * FolderCalculator 单元测试。
 *
 * 回归动机：旧实现对每个目录都同时发起"全部子目录 + 全部文件"的 Promise.all，
 * 在途调用数等于整棵树的节点数，没有任何上限。实测十万级文件时在途 6.5 万、
 * JS 堆 215MB，四十万级时在途 26 万、堆 752MB，二百九十多万节点时堆耗尽、
 * 扩展主机进程被系统杀掉（用户看到"扩展主机意外终止并重启"，VSCode 对 OOM
 * 与被杀没有专属文案）。堆耗尽之前 GC 先进入无效回收，表现为长时间不返回结果。
 * 同时取消只是一个静态标志位，叶子层的 stat 完全不检查它，实测在途 26 万时取消，
 * 结果仍以正常值收尾、还要再烧 642ms；而 execute() 紧接着又复位该标志，
 * 使"被取消"的运行恢复成完全不受取消影响并与新运行叠加，负载直接翻倍。
 *
 * 本文件锁死四条契约：
 * 1. 在途文件系统调用数有固定上限，且不随树的规模增长；
 * 2. 取消能让计算尽快以 CalculationCancelledError 结束，且不残留在途调用；
 * 3. 统计口径与旧实现一致（符号链接不计、失败项只记日志、根目录读不了必须抛错）；
 * 4. 遍历一定会终止（宽树、深树、失败目录混合时都不挂起）。
 */

const uri = (path: string) => vscode.Uri.file(path);

const dir = (name: string, children: VirtualEntry[] = []): VirtualEntry => ({
  name,
  kind: "dir",
  children,
});

const file = (name: string, size: number): VirtualEntry => ({
  name,
  kind: "file",
  size,
});

/** 生成一棵每层 branches 个分支、每目录 filesPerDir 个文件的规则树 */
function balanced(
  branches: number,
  depth: number,
  filesPerDir: number,
  level = 0,
): VirtualEntry[] {
  const entries: VirtualEntry[] = [];
  for (let i = 0; i < filesPerDir; i++) {
    entries.push(file(`f${i}`, 10));
  }
  if (level < depth) {
    for (let i = 0; i < branches; i++) {
      entries.push(
        dir(`d${i}`, balanced(branches, depth, filesPerDir, level + 1)),
      );
    }
  }
  return entries;
}

/** 等待条件成立。用于让计算跑到"确实有调用在途"的状态再取消。 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("等待条件超时");
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => __reset());

describe("统计口径", () => {
  test("累加字节数、文件数与目录数，目录数不含根目录自身", async () => {
    __setVirtualFs("/root", [
      file("a.txt", 100),
      file("b.txt", 200),
      dir("sub", [file("c.txt", 300), dir("sub2", [file("d.txt", 400)])]),
    ]);

    const result = await FolderCalculator.calculate(uri("/root"));

    assert.equal(result.folderName, "root");
    assert.equal(result.totalSize, 1000);
    assert.equal(result.fileCount, 4);
    assert.equal(result.folderCount, 2);
    assert.equal(result.modifiedTime, VIRTUAL_FS_MTIME);
  });

  test("空目录返回全零而不是报错", async () => {
    __setVirtualFs("/root", []);

    const result = await FolderCalculator.calculate(uri("/root"));

    assert.deepEqual(
      {
        size: result.totalSize,
        files: result.fileCount,
        dirs: result.folderCount,
      },
      { size: 0, files: 0, dirs: 0 },
    );
  });

  test("符号链接与未知类型都不计入统计", async () => {
    // readDirectory 对符号链接返回"目标类型 | SymbolicLink"的位掩码。
    // 严格相等比较因此把它们排除在外——这是遍历不会因环形链接而永不结束的前提。
    __setVirtualFs("/root", [
      file("real.txt", 10),
      { name: "link.txt", kind: "symlinkFile", size: 999 },
      {
        name: "linkdir",
        kind: "symlinkDir",
        children: [file("inside.txt", 888)],
      },
      { name: "weird", kind: "unknown" },
    ]);

    const result = await FolderCalculator.calculate(uri("/root"));

    assert.equal(result.totalSize, 10);
    assert.equal(result.fileCount, 1);
    assert.equal(result.folderCount, 0);
  });

  test("单个文件读取失败只记日志，不影响总量与计数", async () => {
    __setVirtualFs("/root", [
      file("ok.txt", 10),
      { name: "bad.txt", kind: "file", size: 1, fail: true },
    ]);

    const result = await FolderCalculator.calculate(uri("/root"));

    // 旧实现让失败的 stat 返回 -1 并加入总和：每个读不到的文件反而让总大小少 1 字节。
    assert.equal(result.totalSize, 10);
    assert.equal(result.fileCount, 1);
  });

  test("子目录读取失败后其余分支照常统计", async () => {
    __setVirtualFs("/root", [
      dir("good", [file("a.txt", 5)]),
      { name: "bad", kind: "dir", children: [file("b.txt", 7)], fail: true },
    ]);

    const result = await FolderCalculator.calculate(uri("/root"));

    assert.equal(result.totalSize, 5);
    assert.equal(result.fileCount, 1);
    // 两个子目录都计入：它们在父目录读取成功时就已被识别为目录，
    // 与旧实现的 folders.length 口径一致（失败的那个目录只是自己的子项没被统计）
    assert.equal(result.folderCount, 2);
  });

  test("根目录读取失败必须抛错，不能当成空文件夹返回 0", async () => {
    // 以文件路径为根：stat 能成功，readDirectory 报 ENOTDIR。
    // 旧实现的根目录走的是不吞异常的递归入口，读失败同样上抛，这里必须保持一致。
    __setVirtualFs("/root", [file("a.txt", 1)]);

    await assert.rejects(
      FolderCalculator.calculate(uri("/root/a.txt")),
      /ENOTDIR/,
    );
  });
});

describe("并发上限", () => {
  test("在途调用数有上限，且不随树的规模增长", async () => {
    __setFsLatency(1);

    __setVirtualFs("/root", balanced(3, 4, 3));
    await FolderCalculator.calculate(uri("/root"));
    const smallerPeak = fsStats.peakInFlight;
    const smallerCalls = fsStats.statCalls + fsStats.readDirCalls;

    __reset();
    __setFsLatency(1);
    __setVirtualFs("/root", balanced(3, 6, 3));
    await FolderCalculator.calculate(uri("/root"));
    const largerPeak = fsStats.peakInFlight;
    const largerCalls = fsStats.statCalls + fsStats.readDirCalls;

    // 先确认两次运行的规模确实差了一个量级，否则下面的比较没有意义
    assert.ok(
      largerCalls > smallerCalls * 5,
      `两次运行的调用量应相差一个量级：${smallerCalls} vs ${largerCalls}`,
    );
    // 确实存在并发（没有被意外串行化）
    assert.ok(largerPeak >= 8, `在途峰值过低，疑似被串行化：${largerPeak}`);
    // 规模涨了一个量级，在途峰值不变——这就是旧实现缺的那条约束
    assert.equal(largerPeak, smallerPeak);
    // 兜底上界：具体取值是实现细节，这里只挡住失控增长
    assert.ok(largerPeak <= 32, `在途峰值失控：${largerPeak}`);
  });

  test("宽树与深树混合时遍历会终止且不挂起", async () => {
    __setFsLatency(1);
    __setVirtualFs("/root", [
      ...balanced(2, 8, 2),
      dir(
        "wide",
        Array.from({ length: 200 }, (_, i) => file(`w${i}`, 1)),
      ),
    ]);

    const result = await FolderCalculator.calculate(uri("/root"));

    assert.equal(result.fileCount > 200, true);
    assert.equal(fsStats.inFlight, 0);
  });
});

describe("取消", () => {
  test("取消前的调用不再发起，且以取消异常结束", async () => {
    __setVirtualFs("/root", balanced(3, 4, 3));
    const source = new vscode.CancellationTokenSource();
    source.cancel();

    await assert.rejects(
      FolderCalculator.calculate(uri("/root"), source.token),
      CalculationCancelledError,
    );
    assert.equal(fsStats.statCalls + fsStats.readDirCalls, 0);
  });

  test("计算进行中取消：尽快结束、不残留在途调用", async () => {
    __setFsLatency(1);
    __setVirtualFs("/root", balanced(3, 5, 3));
    const source = new vscode.CancellationTokenSource();

    // 立即挂上处理函数，避免取消期间的拒绝被判为未处理
    const settled = FolderCalculator.calculate(uri("/root"), source.token).then(
      () => ({ cancelled: false as const }),
      (error: unknown) => ({ cancelled: true as const, error }),
    );

    await waitFor(() => fsStats.inFlight > 0);
    const callsBeforeCancel = fsStats.statCalls + fsStats.readDirCalls;
    source.cancel();

    const outcome = await settled;
    assert.equal(outcome.cancelled, true);
    assert.ok(outcome.error instanceof CalculationCancelledError);
    // 取消后至多再完成一个在途调用，而不是把整棵树跑完
    const callsAfterCancel = fsStats.statCalls + fsStats.readDirCalls;
    assert.ok(
      callsAfterCancel - callsBeforeCancel <= 16,
      `取消后仍发起 ${callsAfterCancel - callsBeforeCancel} 次调用`,
    );
    assert.equal(fsStats.inFlight, 0);
  });
});

describe("重复触发不叠加", () => {
  test("后一次运行会让前一次真正退出，负载不翻倍", async () => {
    __setFsLatency(1);
    __setVirtualFs("/root", balanced(3, 5, 3));

    const first = new vscode.CancellationTokenSource();
    const second = new vscode.CancellationTokenSource();

    const firstSettled = FolderCalculator.calculate(
      uri("/root"),
      first.token,
    ).then(
      () => ({ cancelled: false as const }),
      () => ({ cancelled: true as const }),
    );

    await waitFor(() => fsStats.inFlight > 0);
    const peakBeforeSecondStart = fsStats.peakInFlight;
    first.cancel();

    const outcome = await firstSettled;
    assert.equal(outcome.cancelled, true);
    // 第一次运行已经释放掉全部在途调用，第二次运行才可能独占并发额度
    assert.equal(fsStats.inFlight, 0);

    await FolderCalculator.calculate(uri("/root"), second.token);
    assert.ok(
      fsStats.peakInFlight <= peakBeforeSecondStart + 32,
      `并发额度被两次运行叠加占用：${fsStats.peakInFlight}`,
    );
  });
});
