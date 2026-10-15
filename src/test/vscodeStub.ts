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

/** 已执行命令的记录（命令名 + 参数），供测试断言 */
let executedCommands: Array<{ command: string; args: unknown[] }> = [];

/** 命令失败注入表：命令名 → 调用时抛出的错误 */
let commandErrors: Record<string, Error> = {};

/** 取已执行命令的调用记录 */
export function __getExecutedCommands() {
  return executedCommands;
}

/** 让指定命令在被调用时抛错，用于验证调用方的容错分支 */
export function __setCommandError(command: string, error: Error) {
  commandErrors[command] = error;
}

export function __reset() {
  configStore = {};
  relativePathOverrides = {};
  workspaceFolders = [];
  createdWatchers = [];
  executedCommands = [];
  commandErrors = {};
  __resetFs();
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

/**
 * 与 vscode.FileType 的取值一致。
 * 注意符号链接是位掩码组合：File|SymbolicLink = 65，Directory|SymbolicLink = 66。
 */
export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

/** 虚拟文件系统节点类型。symlink* 用于复刻 readDirectory 返回的位掩码组合。 */
export type VirtualKind =
  "file" | "dir" | "symlinkFile" | "symlinkDir" | "unknown";

export interface VirtualEntry {
  name: string;
  kind: VirtualKind;
  /** 文件大小（字节），仅 file 有意义 */
  size?: number;
  /** 子项，仅 dir 有意义 */
  children?: VirtualEntry[];
  /** 该条目在 stat / readDirectory 时抛错，用于覆盖容错分支 */
  fail?: boolean;
}

/** 虚拟文件系统按绝对路径索引 */
let virtualNodes = new Map<string, VirtualEntry>();

/** 每次文件系统调用的模拟延迟（事件循环节拍数），0 表示不延迟 */
let fsLatencyHops = 0;

/** 虚拟文件系统调用的在途与总量统计，供"并发是否有上限"的断言使用 */
export const fsStats = {
  inFlight: 0,
  peakInFlight: 0,
  statCalls: 0,
  readDirCalls: 0,
};

/** 虚拟文件系统返回的固定修改时间，便于断言 */
export const VIRTUAL_FS_MTIME = 1700000000000;

export function __resetFs(): void {
  virtualNodes = new Map();
  fsLatencyHops = 0;
  fsStats.inFlight = 0;
  fsStats.peakInFlight = 0;
  fsStats.statCalls = 0;
  fsStats.readDirCalls = 0;
}

/** 注入虚拟文件树：root 为根目录绝对路径，children 为其直接子项 */
export function __setVirtualFs(root: string, children: VirtualEntry[]): void {
  virtualNodes = new Map();
  const index = (path: string, entry: VirtualEntry): void => {
    virtualNodes.set(path, entry);
    for (const child of entry.children ?? []) {
      index(`${path}/${child.name}`, child);
    }
  };
  index(root, { name: root, kind: "dir", children });
}

/** 注入文件系统调用延迟（事件循环节拍数） */
export function __setFsLatency(hops: number): void {
  fsLatencyHops = hops;
}

function typeOf(kind: VirtualKind): number {
  switch (kind) {
    case "file":
      return FileType.File;
    case "dir":
      return FileType.Directory;
    // 符号链接返回"目标类型 | SymbolicLink"的位掩码，与真实 readDirectory 一致
    case "symlinkFile":
      return FileType.File | FileType.SymbolicLink;
    case "symlinkDir":
      return FileType.Directory | FileType.SymbolicLink;
    default:
      return FileType.Unknown;
  }
}

async function fsDelay(): Promise<void> {
  for (let i = 0; i < fsLatencyHops; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * 包裹一次虚拟文件系统调用：统计在途数、施加延迟。
 * 与被测代码的并发上限无关，只让"同时有多少个调用在途"可被观测。
 */
async function trackFsCall<T>(call: () => T): Promise<T> {
  fsStats.inFlight++;
  if (fsStats.inFlight > fsStats.peakInFlight) {
    fsStats.peakInFlight = fsStats.inFlight;
  }
  try {
    await fsDelay();
    return call();
  } finally {
    fsStats.inFlight--;
  }
}

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
   * 虚拟文件系统：只实现被测代码用到的 stat 与 readDirectory。
   * 读不到或标记了 fail 的条目一律抛错，以复刻真实的权限/存在性失败。
   * 路径用 uri.path 索引，因为 FolderCalculator 按 path 遍历。
   */
  fs: {
    async stat(uri: { path: string }) {
      fsStats.statCalls++;
      return trackFsCall(() => {
        const node = virtualNodes.get(uri.path);
        if (!node || node.fail) {
          throw new Error(`ENOENT: ${uri.path}`);
        }
        return { size: node.size ?? 0, mtime: VIRTUAL_FS_MTIME };
      });
    },

    async readDirectory(uri: { path: string }) {
      fsStats.readDirCalls++;
      return trackFsCall((): Array<[string, number]> => {
        const node = virtualNodes.get(uri.path);
        if (!node || node.fail) {
          throw new Error(`ENOENT: ${uri.path}`);
        }
        if (node.kind !== "dir") {
          throw new Error(`ENOTDIR: ${uri.path}`);
        }
        return (node.children ?? []).map(
          (child) => [child.name, typeOf(child.kind)] as [string, number],
        );
      });
    },
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
    return { scheme: "file", path: fsPath, fsPath };
  },

  /** 与真实 Uri 一致：base 末尾斜杠不重复，子项以 / 连接 */
  joinPath(base: { scheme: string; path: string }, ...parts: string[]) {
    const path = base.path.replace(/\/+$/, "") + "/" + parts.join("/");
    return { scheme: base.scheme, path, fsPath: path };
  },
};

/**
 * vscode.CancellationTokenSource 的最小复刻：cancel() 后 token.isCancellationRequested 为 true。
 * onCancellationRequested 刻意不提供实现——被测代码不应订阅取消事件，
 * 一旦订阅就应在此明确报错，而不是静默拿到一个空实现。
 */
export class CancellationTokenSource {
  public readonly token = {
    isCancellationRequested: false,
    onCancellationRequested(): never {
      throw new Error(
        "CancellationToken.onCancellationRequested 未在测试桩中实现",
      );
    },
  };

  public cancel(): void {
    this.token.isCancellationRequested = true;
  }

  /** 桩件不持有需要释放的资源 */
  public dispose(): void {}
}

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

/**
 * commands 桩：记录调用并按注入的错误表决定是否抛错。
 * 供"让内置 Git 注册仓库"这类依赖命令调用的代码做断言。
 */
export const commands = {
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    executedCommands.push({ command, args });
    const error = commandErrors[command];
    if (error) {
      throw error;
    }
    return undefined;
  },
};
