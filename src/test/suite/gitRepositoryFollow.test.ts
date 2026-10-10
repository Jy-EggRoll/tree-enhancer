import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import * as vscode from "vscode";

import { followGitRepository } from "../../terminalExplorer/gitRepositoryFollow";
import {
  __reset,
  __setConfig,
  __getExecutedCommands,
  __setCommandError,
} from "../vscodeStub";

/**
 * followGitRepository 单元测试。
 *
 * 回归动机：内置 Git 的仓库自动发现只覆盖工作区文件夹与已打开的编辑器
 * （git.autoRepositoryDetection），终端 CWD 不在其检测范围内，因此终端 cd 进一个
 * 工作区之外的仓库时，源代码管理视图不会认识它，必须先在该仓库内打开一个文件才会
 * 触发识别。本函数负责把终端 CWD 交给 git.openRepository 命令。
 *
 * 本文件锁死三条契约：
 * 1. 默认（开关开启）时，用 CWD 的 fsPath 调用一次 git.openRepository；
 * 2. 开关关闭时完全不调用，不产生任何 git 命令开销；
 * 3. 命令不可用（Git 扩展被禁用或未安装）时静默返回——调用点是终端 CWD 回调，
 *    异常若向外抛出会打断同一回调内的树刷新与目录监控切换。
 */

const cwd = () => vscode.Uri.file("/repo/a");

beforeEach(() => __reset());

describe("followGitRepository：让内置 Git 注册终端 CWD 所在仓库", () => {
  test("默认开启：以 CWD 的 fsPath 调用 git.openRepository", async () => {
    await followGitRepository(cwd());

    const calls = __getExecutedCommands();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "git.openRepository");
    assert.deepEqual(calls[0].args, ["/repo/a"]);
  });

  test("开关关闭：不调用任何命令", async () => {
    __setConfig({
      "tree-enhancer": { "terminalExplorer.followGitRepository": false },
    });

    await followGitRepository(cwd());

    assert.equal(__getExecutedCommands().length, 0);
  });

  test("命令不可用：静默返回，不向调用方抛异常", async () => {
    __setCommandError(
      "git.openRepository",
      new Error("command 'git.openRepository' not found"),
    );

    await assert.doesNotReject(() => followGitRepository(cwd()));

    // 仍然记录了这次尝试，便于排查"为什么没有生效"
    assert.equal(__getExecutedCommands().length, 1);
  });
});
