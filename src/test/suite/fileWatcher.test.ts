import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import * as vscode from "vscode";

import { FileWatcherManager } from "../../utils/fileWatcher";
import {
  __reset,
  __setConfig,
  __setWorkspaceFolders,
  __fireWatcher,
  __getCreatedWatchers,
} from "../vscodeStub";

/**
 * FileWatcherManager 单元测试。
 *
 * 回归动机：文件装饰 tooltip（大小/修改时间/L 徽标）由 VSCode 缓存，必须显式
 * fire onDidChangeFileDecorations 才会失效。修复前装饰失效只覆盖
 * workspaceFolders，而终端 CWD 常在工作区之外，终端树自己的 watcher 又只刷新树、
 * 不通知装饰，于是"文件已修改，悬浮仍显示旧的大小/修改时间"。
 *
 * 本文件锁死两条契约：
 * 1. createDirectoryWatcher 为非递归（单层 glob），增删改共用同一回调 —— 该回调
 *    即终端树侧"刷新树 + 失效装饰"的统一入口；
 * 2. createWorkspaceWatchers 覆盖多个工作区根、只派发 change/create，并继续遵守
 *    files.exclude 过滤。删除不派发是有意为之（官方资源管理器自行处理，
 *    曾据此把删除回调作为空实现移除，见 6937847）。
 */

const file = (fsPath: string) => vscode.Uri.file(fsPath);

beforeEach(() => __reset());

describe("createDirectoryWatcher：终端 CWD 非递归监控", () => {
  test("监听范围为单层 glob（非递归）", () => {
    const manager = new FileWatcherManager();
    manager.createDirectoryWatcher(file("/proj"), () => {});

    const watchers = __getCreatedWatchers();
    assert.equal(watchers.length, 1);
    assert.equal(watchers[0].pattern, "*");
  });

  test("change/create/delete 共用一个回调，三者都会触发", () => {
    const manager = new FileWatcherManager();
    const seen: string[] = [];
    manager.createDirectoryWatcher(file("/proj"), (uri) =>
      seen.push(uri.fsPath),
    );

    __fireWatcher("change", file("/proj/a.ts"));
    __fireWatcher("create", file("/proj/b.ts"));
    __fireWatcher("delete", file("/proj/c.ts"));

    assert.deepEqual(seen, ["/proj/a.ts", "/proj/b.ts", "/proj/c.ts"]);
  });

  test("不过滤 files.exclude（树在读取时自行过滤，装饰侧本就返回 undefined）", () => {
    __setConfig({ files: { exclude: { "**/node_modules": true } } });
    const manager = new FileWatcherManager();
    const seen: string[] = [];
    manager.createDirectoryWatcher(file("/outside"), (uri) =>
      seen.push(uri.fsPath),
    );

    __fireWatcher("change", file("/outside/node_modules/x.js"));

    assert.deepEqual(seen, ["/outside/node_modules/x.js"]);
  });
});

describe("createWorkspaceWatchers：工作区递归监控", () => {
  test("每个工作区根各建一个递归监控器", () => {
    __setWorkspaceFolders([{ uri: file("/a") }, { uri: file("/b") }]);
    const manager = new FileWatcherManager();

    const watchers = manager.createWorkspaceWatchers(
      () => {},
      () => {},
    );

    assert.equal(watchers.length, 2);
    assert.deepEqual(
      __getCreatedWatchers().map((watcher) => watcher.pattern),
      ["**/*", "**/*"],
    );
  });

  test("无工作区时返回空数组", () => {
    __setWorkspaceFolders([]);
    const manager = new FileWatcherManager();
    assert.equal(
      manager.createWorkspaceWatchers(
        () => {},
        () => {},
      ).length,
      0,
    );
  });

  test("只派发 change/create，不派发 delete（有意为之，见 6937847）", () => {
    __setWorkspaceFolders([{ uri: file("/a") }]);
    const manager = new FileWatcherManager();
    const seen: string[] = [];
    manager.createWorkspaceWatchers(
      (uri) => seen.push(`change:${uri.fsPath}`),
      (uri) => seen.push(`create:${uri.fsPath}`),
    );

    __fireWatcher("change", file("/a/x.ts"));
    __fireWatcher("create", file("/a/y.ts"));
    __fireWatcher("delete", file("/a/gone.ts"));

    assert.deepEqual(seen, ["change:/a/x.ts", "create:/a/y.ts"]);
  });

  test("被 files.exclude 命中的路径不派发", () => {
    __setConfig({ files: { exclude: { "**/ignored": true } } });
    __setWorkspaceFolders([{ uri: file("/a") }]);
    const manager = new FileWatcherManager();
    const seen: string[] = [];
    manager.createWorkspaceWatchers(
      (uri) => seen.push(uri.fsPath),
      () => {},
    );

    __fireWatcher("change", file("/a/ignored/x.ts"));
    __fireWatcher("change", file("/a/kept/x.ts"));

    assert.deepEqual(seen, ["/a/kept/x.ts"]);
  });
});
