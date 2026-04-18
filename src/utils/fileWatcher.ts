import * as vscode from "vscode";
import { minimatch } from "minimatch";
import { log } from "./func";

/**
 * 文件监控管理器 (FileWatcherManager)
 *
 * 设计理念:
 * 1. 利用 VSCode 内置 - createFileSystemWatcher 自动遵守 files.watcherExclude
 * 2. 使用 minimatch 库处理 glob 模式匹配
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
     * 使用 minimatch 进行 glob 模式匹配
     */
    public shouldHandle(uri: vscode.Uri): boolean {
        if (this.excludePatterns.length === 0) {
            return true;
        }

        // 使用 VSCode 内置 API 获取相对路径
        const relativePath = vscode.workspace.asRelativePath(uri, false);

        for (const pattern of this.excludePatterns) {
            if (minimatch(relativePath, pattern, { dot: true })) {
                return false;
            }
        }

        return true;
    }

    /** 重新加载配置 */
    public reload(): void {
        this.excludePatterns = [];
        this.loadExcludePatterns();
    }

    /**
     * 创建文件监控器
     * VSCode 自动应用 files.watcherExclude，我们额外检查 files.exclude
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