/**
 * 测试用的 vscode 模块桩件。
 *
 * 单元测试在扩展宿主之外运行，真实的 vscode 模块不可用；
 * scripts/run-tests.cjs 会把源码中的 "vscode" 导入别名到本文件。
 *
 * 只实现被测试代码实际用到的 API，未实现的一律不提供，
 * 以便测试在遇到意外依赖时明确报错，而不是静默得到 undefined。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 扩展根目录的绝对路径，由 scripts/run-tests.cjs 在打包时用 esbuild define 注入。
 * 用于读取 package.json 声明的配置默认值——桩件按真实 VSCode 的行为在用户未设置时
 * 返回这些声明值，而不是让被测代码自带的字面量兜底（那样测的就不是真实行为了）。
 */
declare const __EXTENSION_ROOT__: string;

/** 供测试注入的配置表：{ 配置节: { 键: 值 } } */
let configStore: Record<string, Record<string, unknown>> = {};

/** 供测试注入的 asRelativePath 结果覆盖表 */
let relativePathOverrides: Record<string, string> = {};

/** 供测试注入的工作区文件夹（createWorkspaceWatchers 依赖） */
let workspaceFolders: Array<{ uri: { fsPath: string } }> = [];

interface StubWatcherCallbacks {
  change: Array<(uri: unknown) => void>;
  create: Array<(uri: unknown) => void>;
  delete: Array<(uri: unknown) => void>;
}

/** createFileSystemWatcher 创建的监控器登记表，供测试触发事件与断言范围 */
let createdWatchers: Array<{
  base: unknown;
  pattern: string;
  callbacks: StubWatcherCallbacks;
}> = [];

export function __setConfig(store: Record<string, Record<string, unknown>>) {
  configStore = store;
}

export function __setRelativePathOverride(overrides: Record<string, string>) {
  relativePathOverrides = overrides;
}

/** 注入工作区文件夹列表 */
export function __setWorkspaceFolders(
  folders: Array<{ uri: { fsPath: string } }>,
) {
  workspaceFolders = folders;
}

/** 模拟文件系统变更：向所有已创建监控器派发指定事件 */
export function __fireWatcher(
  kind: "change" | "create" | "delete",
  uri: unknown,
) {
  for (const watcher of createdWatchers) {
    for (const callback of watcher.callbacks[kind]) {
      callback(uri);
    }
  }
}

/** 读取已创建监控器的监听范围（base + pattern），用于断言递归/非递归 */
export function __getCreatedWatchers() {
  return createdWatchers.map(({ base, pattern }) => ({ base, pattern }));
}

export function __reset() {
  configStore = {};
  relativePathOverrides = {};
  workspaceFolders = [];
  createdWatchers = [];
}

/** 解析 %key% 形式的清单字符串（模拟 VSCode 对 package.nls.json 的替换） */
function resolveManifestString(
  value: unknown,
  nls: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    const match = value.match(/^%([^%]+)%$/);
    return match ? (nls[match[1]] ?? value) : value;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        resolveManifestString(nested, nls),
      ]),
    );
  }
  return value;
}

/**
 * 读取 package.json 中 contributes.configuration 声明的默认值，
 * 键为完整配置键（如 tree-enhancer.fileSizeBase）。
 * 读不到时返回空表，此时 get() 只返回注入值或调用方传入的默认值。
 */
function loadDeclaredDefaults(): Record<string, unknown> {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__EXTENSION_ROOT__, "package.json"), "utf8"),
    );
    const nls = JSON.parse(
      readFileSync(join(__EXTENSION_ROOT__, "package.nls.json"), "utf8"),
    );
    const properties = (pkg?.contributes?.configuration?.properties ??
      {}) as Record<string, { default?: unknown }>;

    const defaults: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(properties)) {
      if (schema && "default" in schema) {
        defaults[key] = resolveManifestString(schema.default, nls);
      }
    }
    return defaults;
  } catch {
    return {};
  }
}

const declaredDefaults = loadDeclaredDefaults();

export const workspace = {
  get workspaceFolders() {
    return workspaceFolders;
  },

  /**
   * 复刻真实行为：能求出相对路径时返回相对路径，否则原样返回绝对路径。
   * 测试可通过 __setRelativePathOverride 指定映射；未指定时按"路径在工作区内"
   * 处理，即去掉工作区前缀。
   */
  asRelativePath(
    uri: { fsPath: string },
    _includeWorkspaceFolder?: boolean,
  ): string {
    if (uri.fsPath in relativePathOverrides) {
      return relativePathOverrides[uri.fsPath];
    }
    return uri.fsPath.replace(/^\//, "");
  },

  getConfiguration(section: string) {
    return {
      /**
       * 复刻真实行为：注入值优先，其次 package.json 声明的默认值，
       * 最后才是调用方传入的 default（仅用于 package.json 未声明的键）。
       */
      get<T>(key: string, defaultValue?: T): T | undefined {
        const injected = configStore[section]?.[key];
        if (injected !== undefined) {
          return injected as T;
        }
        const declared = declaredDefaults[`${section}.${key}`];
        return declared !== undefined ? (declared as T) : defaultValue;
      },
    };
  },

  /**
   * 返回一个可被测试触发的假监控器。
   * 真实 vscode 的 FileSystemWatcher 事件无法在宿主外模拟，
   * 故登记回调并由 __fireWatcher 派发。
   */
  createFileSystemWatcher(pattern: { base: unknown; pattern: string }) {
    const callbacks: StubWatcherCallbacks = {
      change: [],
      create: [],
      delete: [],
    };
    createdWatchers.push({
      base: pattern.base,
      pattern: pattern.pattern,
      callbacks,
    });
    return {
      onDidChange(cb: (uri: unknown) => void) {
        callbacks.change.push(cb);
        return { dispose() {} };
      },
      onDidCreate(cb: (uri: unknown) => void) {
        callbacks.create.push(cb);
        return { dispose() {} };
      },
      onDidDelete(cb: (uri: unknown) => void) {
        callbacks.delete.push(cb);
        return { dispose() {} };
      },
      dispose() {},
    };
  },
};

/** 最小 RelativePattern 桩：仅保留 base 与 pattern 供断言 */
export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}

export const Uri = {
  file(fsPath: string) {
    return { fsPath };
  },
};

export const l10n = {
  t(message: string, ...args: unknown[]): string {
    return args.reduce<string>(
      (acc, arg, i) => acc.replace(`{${i}}`, String(arg)),
      message,
    );
  },
};

/**
 * window 桩：单测在 getLogger() 之前不应调用 initLogger()，
 * 因此 createOutputChannel 一旦被调用即抛错（保持"未实现就明确报错"的约定）。
 */
export const window = {
  createOutputChannel(_name: string, _options?: unknown): never {
    throw new Error(
      "createOutputChannel 未在测试桩中实现：单元测试不应调用 initLogger()",
    );
  },
};
