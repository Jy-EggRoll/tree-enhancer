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
     * 创建文件监控器
     */
    public createWatcher(
        folder: vscode.WorkspaceFolder,
        onChange: (uri: vscode.Uri) => void,
        onCreate: (uri: vscode.Uri) => void,
    ): vscode.FileSystemWatcher {
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
    }
}