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

export function __setConfig(store: Record<string, Record<string, unknown>>) {
    configStore = store;
}

export function __setRelativePathOverride(
    overrides: Record<string, string>,
) {
    relativePathOverrides = overrides;
}

export function __reset() {
    configStore = {};
    relativePathOverrides = {};
}

export const workspace = {
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
};

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
