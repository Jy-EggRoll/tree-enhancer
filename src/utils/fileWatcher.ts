import * as vscode from "vscode";
import { getLogger } from "./func";
import { readExcludePatterns, pathMatchesExclude } from "./excludeMatcher";

const log = getLogger();

/**
 * 文件监控管理器 (FileWatcherManager)
 *
 * 核心目标：只要不在 VSCode 资源管理器显示，就不纳入监控
 *
 * 实现方式：
 * 1. 使用 files.exclude 配置 - 这是资源管理器显示/隐藏文件的依据
 * 2. 通过 utils/excludeMatcher 做 glob 模式匹配（与终端文件树共用同一实现）
 * 3. 使用 vscode.workspace.asRelativePath 获取相对路径
 */
export class FileWatcherManager {
  /** files.exclude 模式 */
  private excludePatterns: string[] = [];

  constructor() {
    this.loadExcludePatterns();
  }

  /**
   * 加载 files.exclude 配置
   */
  private loadExcludePatterns(): void {
    this.excludePatterns = readExcludePatterns();

    log.debug(
      vscode.l10n.t(
        "[FileWatcher] Exclude patterns: {0}",
        this.excludePatterns.join(", "),
      ),
    );
  }

  /**
   * 检查文件是否应该被处理，被 files.exclude 命中的一律不处理。
   *
   * 与终端文件树 isExcluded 的关系：两者共用 pathMatchesExclude，
   * 但本方法**不做工作区外路径守卫**（isExcludedByConfig 有，故树侧对工作区外
   * 路径一律返回"未排除"）。因此对工作区外的 uri，asRelativePath 会原样返回
   * 绝对路径并照常参与匹配，命中则此处返回 false，两侧结果可以不同。
   *
   * 该差异为既有行为（HEAD 的 matchesExclude 同样无守卫），非本次引入。
   * 工作区外 uri 在本方法上是可达的：FileDecorationProvider 的
   * provideFileDecoration 会先调用本方法（provider.ts:28），其工作区外判断位于
   * isSymbolicLink 分支内部（provider.ts:48-51），故工作区外且非符号链接的普通
   * 文件会继续走完装饰流程；终端树在无工作区时也会回退到用户主目录
   *（terminalTracker.ts:124-128），其树项设置了 resourceUri（treeDataProvider.ts:39），
   * 同样会触发装饰请求。两侧结果差异的实际用户影响未经验证。
   */
  public shouldHandle(uri: vscode.Uri): boolean {
    if (this.excludePatterns.length === 0) {
      return true;
    }

    const relativePath = vscode.workspace.asRelativePath(uri, false);

    return !this.excludePatterns.some((pattern) =>
      pathMatchesExclude(relativePath, pattern, {
        // 监控器按全量 glob 订阅整棵工作区，需要把被排除目录的后代
        // 一并挡掉，否则这些文件仍会进入监控与装饰计算。
        matchDescendants: true,
      }),
    );
  }

  /** 重新加载配置 */
  public reload(): void {
    this.excludePatterns = [];
    this.loadExcludePatterns();
  }

  /**
   * 为所有工作区文件夹创建递归监控器（递归 glob，覆盖全部子目录），
   * 覆盖官方资源管理器可见范围的深层变更。无工作区时返回空数组。
   *
   * 需过滤 files.exclude：整棵工作区被全量订阅，被排除目录的后代也必须挡掉，
   * 否则它们仍会进入装饰计算。
   *
   * 不监听删除：官方资源管理器会自行处理删除后的节点与装饰，
   * 曾因此把删除回调作为空实现移除（见 6937847）。
   */
  public createWorkspaceWatchers(
    onChange: (uri: vscode.Uri) => void,
    onCreate: (uri: vscode.Uri) => void,
  ): vscode.FileSystemWatcher[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "**/*"),
      );

      watcher.onDidChange((uri) => {
        if (this.shouldHandle(uri)) {
          onChange(uri);
        }
      });

      watcher.onDidCreate((uri) => {
        if (this.shouldHandle(uri)) {
          onCreate(uri);
        }
      });

      log.debug(
        vscode.l10n.t("[FileWatcher] Created for: {0}", folder.uri.fsPath),
      );

      return watcher;
    });
  }

  /**
   * 为任意目录创建非递归监控器（单层 glob，仅直接子节点）。
   * 供终端文件树使用：树是懒加载的，只需覆盖当前可见层，
   * 深层变更仍靠顶栏「强制刷新」按钮兜底。
   *
   * 增删改共用同一回调：三者都要求"该目录有变化 → 刷新树 + 失效对应装饰"，
   * 无需区分事件类型。
   *
   * 不做 files.exclude 过滤：树在读取时自行过滤（treeDataProvider.isExcluded），
   * 且装饰提供者对被排除项本就返回 undefined，此处再过滤没有收益。
   */
  public createDirectoryWatcher(
    dir: vscode.Uri,
    onChanged: (uri: vscode.Uri) => void,
  ): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, "*"),
    );

    watcher.onDidChange(onChanged);
    watcher.onDidCreate(onChanged);
    watcher.onDidDelete(onChanged);

    log.debug(vscode.l10n.t("[FileWatcher] Created for: {0}", dir.fsPath));

    return watcher;
  }
}
