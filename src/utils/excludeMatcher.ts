import * as vscode from "vscode";
import { minimatch } from "minimatch";

/**
 * files.exclude 匹配的单一实现。
 *
 * 该规则原先在 FileWatcherManager 与 TerminalFileTreeProvider 中各写了一份，
 * 两份实现只差"目录前缀兜底"一步，容易在后续维护中各自漂移。
 * 现统一收敛到此模块，两处差异通过显式选项表达，见 ExcludeMatchOptions。
 */

/**
 * 匹配选项。刻意设计为必填，避免调用方默默用错语义
 * （历史教训：把"是否兜底匹配后代"隐式固定为 true，曾使终端文件树
 *   在 CWD 落入深层排除目录时误判，把整层子项全部隐藏）。
 */
export interface ExcludeMatchOptions {
  /**
   * 是否启用"目录前缀兜底"，即把被排除目录下的所有后代一并视为排除。
   *
   * minimatch 中 globstar 只能跨目录、不能匹配目录内部的文件名，
   * 因此「globstar + 目录名」这类模式无法匹配其下文件（例如
   * 以 globstar 加 node_modules 为模式时，匹配不到 node_modules 里的 index.js）。
   *
   * - true：文件监控器需要。它按全量 glob 订阅整棵工作区，必须靠兜底
   *         把被排除目录的后代一并挡掉，否则这些文件仍会进入监控与装饰计算。
   * - false：终端文件树需要。树是懒加载的，被排除的目录不会展开，
   *          其后代根本不会进入匹配点；启用兜底反而会在"CWD 位于排除目录内"
   *          时把当前层的全部子项误判为已排除，导致树显示为空。
   */
  matchDescendants: boolean;
}

/**
 * 读取当前生效的 files.exclude 模式（仅取值为 true 的项）。
 *
 * 返回的数组顺序即配置中的键顺序，对匹配语义无影响。
 */
export function readExcludePatterns(): string[] {
  const excludeConfig = vscode.workspace
    .getConfiguration("files")
    .get<Record<string, boolean>>("exclude");

  return excludeConfig
    ? Object.keys(excludeConfig).filter((key) => excludeConfig[key])
    : [];
}

/**
 * 判断相对路径是否被某个排除模式命中。
 *
 * 匹配分两步：
 * 1. 标准 minimatch（开启 dot，使 .git 等点开头项可被匹配）；
 * 2. 可选的目录前缀兜底，仅在 options.matchDescendants 为 true 时启用。
 */
export function pathMatchesExclude(
  relativePath: string,
  pattern: string,
  options: ExcludeMatchOptions,
): boolean {
  if (minimatch(relativePath, pattern, { dot: true })) {
    return true;
  }

  if (!options.matchDescendants) {
    return false;
  }

  // 处理 **/.git 类型的模式，命中 .git 目录下的所有后代
  if (pattern.startsWith("**/")) {
    const matchPart = pattern.slice(3);
    if (
      relativePath.includes("/" + matchPart + "/") ||
      relativePath.endsWith("/" + matchPart)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 判断 uri 是否被 files.exclude 排除。
 *
 * 工作区外的路径一律不过滤：asRelativePath 对工作区外路径会原样返回绝对路径，
 * 此时没有可依据的相对根，官方资源管理器同样不做排除。
 */
export function isExcludedByConfig(
  uri: vscode.Uri,
  patterns: string[],
  options: ExcludeMatchOptions,
): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const relative = vscode.workspace.asRelativePath(uri, false);
  if (vscode.Uri.file(relative).fsPath === uri.fsPath) {
    return false;
  }

  return patterns.some((pattern) =>
    pathMatchesExclude(relative, pattern, options),
  );
}
