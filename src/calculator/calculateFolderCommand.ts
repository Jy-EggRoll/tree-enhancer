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
    public async execute(uri?: vscode.Uri, ...args: any[]): Promise<void> {
        log.info(vscode.l10n.t("[Calculate Folder Command] Command triggered"));

        // 解析目标 URI（直接传入或从 args 数组）
        const targetUri = uri || (args?.[0]?.[0] as vscode.Uri);

        if (!targetUri) {
            // 快捷键调用，从剪贴板获取
            const clipboardUri = await this.getUriFromClipboard();
            if (!clipboardUri) {
                vscode.window.showWarningMessage(
                    vscode.l10n.t(
                        "Please select a folder in the Explorer to calculate",
                    ),
                );
                return;
            }
            await this.calculateFolder(clipboardUri);
            return;
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
     * 从剪贴板获取 URI（快捷键调用）
     */
    private async getUriFromClipboard(): Promise<vscode.Uri | undefined> {
        try {
            const originalClipboard = await vscode.env.clipboard.readText();
            await vscode.commands.executeCommand("copyFilePath");
            const copiedPath = await vscode.env.clipboard.readText();
            await vscode.env.clipboard.writeText(originalClipboard);

            if (copiedPath && copiedPath !== originalClipboard) {
                return vscode.Uri.file(copiedPath);
            }
        } catch (error) {
            log.warn(
                vscode.l10n.t(
                    "[Calculate Folder Command] Failed to get URI from clipboard: {0}",
                    error instanceof Error ? error.message : String(error),
                ),
            );
        }
        return undefined;
    }

    /**
     * 显示计算中状态
     */
    private showCalculating(folderName: string): void {
        this.clearDismissTimer();
        this.statusBarItem.text = `$(sync~spin) ${vscode.l10n.t("Calculating")}: ${folderName}`;
        this.statusBarItem.tooltip = vscode.l10n.t(
            "Calculating folder information...",
        );
        this.statusBarItem.show();
    }

    /**
     * 显示计算结果
     */
    private showResult(result: any): void {
        this.clearDismissTimer();

        const statusText = ResultFormatter.formatForStatusBar(result);
        const tooltipText = ResultFormatter.formatForTooltip(result);

        this.statusBarItem.text = `$(folder) ${statusText} $(close)`;
        this.statusBarItem.tooltip =
            tooltipText + "\n\n" + vscode.l10n.t("Click to dismiss");
        this.statusBarItem.show();

        const delay = ConfigManager.getStatusBarDismissDelay();
        this.dismissTimer = setTimeout(() => {
            this.hideStatusBar();
        }, delay * 1000);

        log.info(
            vscode.l10n.t(
                "[Calculate Folder Command] Result displayed, will dismiss in {0} seconds",
                delay,
            ),
        );
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
