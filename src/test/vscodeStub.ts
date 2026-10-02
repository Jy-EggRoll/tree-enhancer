/**
 * 测试用的 vscode 模块桩件。
 *
 * 单元测试在扩展宿主之外运行，真实的 vscode 模块不可用；
 * scripts/run-tests.mjs 会把源码中的 "vscode" 导入别名到本文件。
 *
 * 只实现被测试代码实际用到的 API，未实现的一律不提供，
 * 以便测试在遇到意外依赖时明确报错，而不是静默得到 undefined。
 */

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

export function __setRelativePathOverride(
    overrides: Record<string, string>,
) {
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

export const workspace = {
    get workspaceFolders() {
        return workspaceFolders;
    },

    /**
     * 复刻真实行为：能求出相对路径时返回相对路径，否则原样返回绝对路径。
     * 测试可通过 __setRelativePathOverride 指定映射；未指定时按"路径在工作区内"
     * 处理，即去掉工作区前缀。
     */
    asRelativePath(uri: { fsPath: string }, _includeWorkspaceFolder?: boolean): string {
        if (uri.fsPath in relativePathOverrides) {
            return relativePathOverrides[uri.fsPath];
        }
        return uri.fsPath.replace(/^\//, "");
    },

    getConfiguration(section: string) {
        return {
            get<T>(key: string, defaultValue?: T): T | undefined {
                const value = configStore[section]?.[key];
                return (value as T) ?? defaultValue;
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
