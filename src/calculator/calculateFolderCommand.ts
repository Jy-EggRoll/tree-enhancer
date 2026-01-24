import * as vscode from "vscode";
import { log } from "../utils/func";
import { FolderCalculator } from "./folderCalculator";
import { ResultFormatter } from "./formatter";
import { ConfigManager } from "../config";

/**
 * 文件夹计算命令处理器
 */
export class CalculateFolderCommand {
    private statusBarItem: vscode.StatusBarItem;
    private dismissTimer?: NodeJS.Timeout;

    constructor(statusBarItem: vscode.StatusBarItem) {
        this.statusBarItem = statusBarItem;
        // 设置点击事件为关闭状态栏
        this.statusBarItem.command = {
            command: "tree-enhancer.dismissStatusBar",
            title: "Dismiss",
        };
    }

    /**
     * 执行文件夹计算命令
     */
    public async execute(uri?: vscode.Uri): Promise<void> {
        // 解析目标 URI
        const targetUri = uri;

        if (!targetUri) {
            // 快捷键调用，特殊获取方式
            const clipboardUri = await this.getUriSpecial();
            if (!clipboardUri) {
                return;
            }
            await this.calculateFolder(clipboardUri);
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculated by Keyboard Shortcut",
                ),
            );
            return;
        } else {
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculated by Context Menu",
                ),
            );
        }

        await this.calculateFolder(targetUri);
    }

    /**
     * 计算文件夹信息
     */
    private async calculateFolder(folderUri: vscode.Uri): Promise<void> {
        const folderName = folderUri.path.split("/").pop() || folderUri.path;
        this.showCalculating(folderName);

        try {
            const result = await FolderCalculator.calculate(folderUri);
            this.showResult(result);
        } catch (error) {
            log.error(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculation failed: {0}",
                    error instanceof Error ? error.message : String(error),
                ),
            );
            this.hideStatusBar();
        }
    }

    /**
     * 特殊方式-剪贴板中转（不会污染剪贴板条目）
     */
    private async getUriSpecial(): Promise<vscode.Uri | undefined> {
        const originalClipboard = await vscode.env.clipboard.readText();
        await vscode.commands.executeCommand("copyFilePath");
        const copiedPath = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(originalClipboard); // 恢复原始剪贴板内容

        if (copiedPath && copiedPath !== originalClipboard) {
            return vscode.Uri.file(copiedPath);
        }

        return undefined;
    }

    /**
     * 显示计算中状态
     */
    private showCalculating(folderName: string): void {
        this.clearDismissTimer();
        this.statusBarItem.text = "$(loading~spin) " + folderName;
        this.statusBarItem.show();
    }

    /**
     * 显示计算结果
     */
    private showResult(result: any): void {
        this.clearDismissTimer();

        const statusText = ResultFormatter.formatForStatusBar(result);

        this.statusBarItem.text = `$(folder) ${statusText}`;
        this.statusBarItem.tooltip = vscode.l10n.t("Click to dismiss");
        this.statusBarItem.show();

        const delay = ConfigManager.getStatusBarDismissDelay();
        if (delay !== 0) {
            this.dismissTimer = setTimeout(() => {
                this.hideStatusBar();
            }, delay * 1000);

            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Result displayed, will dismiss in {0} seconds",
                    delay,
                ),
            );
        } else {
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Result displayed, will not auto-dismiss",
                ),
            );
        }
    }

    /**
     * 隐藏状态栏
     */
    public hideStatusBar(): void {
        this.clearDismissTimer();
        this.statusBarItem.hide();
    }

    /**
     * 清除消失定时器
     */
    private clearDismissTimer(): void {
        if (this.dismissTimer) {
            clearTimeout(this.dismissTimer);
            this.dismissTimer = undefined;
        }
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.clearDismissTimer();
    }
}
