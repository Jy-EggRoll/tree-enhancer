import * as vscode from "vscode";
import { minimatch } from "minimatch";
import { log } from "./func";

/**
 * 文件监控管理器 (FileWatcherManager)
 *
 * 核心目标：只要不在 VSCode 资源管理器显示，就不纳入监控
 *
 * 实现方式：
 * 1. 使用 files.exclude 配置 - 这是资源管理器显示/隐藏文件的依据
 * 2. 使用 minimatch 库进行 glob 模式匹配
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
        const config = vscode.workspace.getConfiguration("files");
        const excludeConfig = config.get<Record<string, boolean>>("exclude");

        if (excludeConfig) {
            this.excludePatterns = Object.keys(excludeConfig).filter(
                (key) => excludeConfig[key],
            );
        }

        log.info(
            vscode.l10n.t(
                "[FileWatcher] Exclude patterns: {0}",
                this.excludePatterns.join(", "),
            ),
        );
    }

    /**
     * 检查文件是否应该被处理
     * 使用 files.exclude 模式进行匹配
     */
    public shouldHandle(uri: vscode.Uri): boolean {
        if (this.excludePatterns.length === 0) {
            return true;
        }

        const relativePath = vscode.workspace.asRelativePath(uri, false);

        for (const pattern of this.excludePatterns) {
            if (this.matchesExclude(relativePath, pattern)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 检查路径是否匹配排除模式
     * 同时处理标准和简化模式
     */
    private matchesExclude(relativePath: string, pattern: string): boolean {
        // 标准 minimatch 匹配
        if (minimatch(relativePath, pattern, { dot: true })) {
            return true;
        }

        // 处理 **/.git 类型的模式，匹配 .git 目录下的所有文件
        if (pattern.startsWith("**/")) {
            const matchPart = pattern.slice(3);
            // 检查路径是否包含 /.git/ 或 /.git 结尾
            // 例如: compiler-principles/.git/FETCH_HEAD 匹配 **/.git
            if (relativePath.includes("/" + matchPart + "/") ||
                relativePath.endsWith("/" + matchPart)) {
                return true;
            }
        }

        return false;
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
        onDelete: (uri: vscode.Uri) => void,
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

        watcher.onDidDelete((uri) => {
            onDelete(uri);
        });

        log.info(
            vscode.l10n.t("[FileWatcher] Created for: {0}", folder.uri.fsPath),
        );

        return watcher;
    }

    public getExcludePatternCount(): number {
        return this.excludePatterns.length;
    }
}