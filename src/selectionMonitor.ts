import * as vscode from "vscode";
import * as fs from "fs";
import { StatusBarManager } from "./statusBarManager";
import { Formatters } from "./utils/formatters";
import { getLogger } from "./utils/func";

const log = getLogger();

/**
 * 选中监控器，监听编辑器激活文件变化，自动在状态栏显示文件信息
 */
export class SelectionMonitor implements vscode.Disposable {
    private statusBarManager: StatusBarManager;
    private disposables: vscode.Disposable[] = [];
    private currentUri: vscode.Uri | undefined;
    private enabled: boolean;

    constructor(statusBarManager: StatusBarManager, enabled: boolean) {
        this.statusBarManager = statusBarManager;
        this.enabled = enabled;
        if (this.enabled) {
            this.startListening();
        }
    }

    /**
     * 刷新当前文件的状态栏信息并重置超时
     * 供文件变更事件回调调用
     */
    public refreshCurrentFile(): void {
        if (this.currentUri) {
            this.handleFileSelected(this.currentUri);
        }
    }

    private startListening(): void {
        // 监听当前激活的编辑器变化
        // 用户打开文件、切换标签页、关闭文件时触发
        const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.uri.scheme === "file") {
                this.handleFileSelected(editor.document.uri);
            } else if (!editor) {
                // 所有编辑器已关闭，隐藏文件信息
                this.currentUri = undefined;
                this.statusBarManager.hide();
            }
        });

        this.disposables.push(disposable);

        // 启动时检查当前是否有激活的编辑器
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === "file") {
            this.handleFileSelected(activeEditor.document.uri);
        }
    }

    /**
     * 处理文件被选中
     */
    private handleFileSelected(uri: vscode.Uri): void {
        this.currentUri = uri;
        const filePath = uri.fsPath;
        const fileName = filePath.split(/[/\\]/).pop() || filePath;

        try {
            const stat = fs.statSync(filePath);
            const fileSize = Formatters.formatFileSize(stat.size);
            const modifiedTime = Formatters.formatDate(new Date(stat.mtime));

            log.debug(
                vscode.l10n.t(
                    "[Selection Monitor] File selected: {0}, size: {1}, modified: {2}",
                    fileName,
                    fileSize,
                    modifiedTime,
                ),
            );

            this.statusBarManager.showFileInfo(fileName, fileSize, modifiedTime);
        } catch (error) {
            log.warn(
                vscode.l10n.t(
                    "[Selection Monitor] Failed to stat file: {0}, error: {1}",
                    filePath,
                    error instanceof Error ? error.message : String(error),
                ),
            );
        }
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}