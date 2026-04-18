import * as vscode from "vscode";
import { log } from "../utils/func";
import { FolderCalculator, CalculationCancelledError } from "./folderCalculator";
import { Formatters } from "../utils/formatters";
import { ConfigManager } from "../config";

/**
     * 文件夹计算命令处理器
 */
export class CalculateFolderCommand {
    private statusBarItem: vscode.StatusBarItem;
    private dismissTimer?: NodeJS.Timeout;
    private isCalculating = false;
    private hasResult = false;

    constructor(statusBarItem: vscode.StatusBarItem) {
        this.statusBarItem = statusBarItem;
        this.statusBarItem.command = {
            command: "tree-enhancer.dismissStatusBar",
            title: "Dismiss",
        };
    }

    public get isRunning(): boolean {
        return this.isCalculating;
    }

    /**
     * 取消当前计算
     */
    public cancel(): void {
        if (this.isCalculating) {
            FolderCalculator.cancel();
            this.hideStatusBar();
            this.isCalculating = false;
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculation cancelled by user",
                ),
            );
        }
    }

    /**
     * 重新开始计算（从选中项）
     */
    public async execute(uri?: vscode.Uri): Promise<void> {
        if (this.isCalculating) {
            FolderCalculator.cancel();
            this.hideStatusBar();
            this.isCalculating = false;
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculation cancelled by user",
                ),
            );
        } else if (this.hasResult) {
            this.hideStatusBar();
            this.hasResult = false;
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Result dismissed, starting new calculation",
                ),
            );
        } else if (uri) {
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculated by Context Menu",
                ),
            );
        }

        this.isCalculating = true;
        FolderCalculator.resetCancel();

        const targetUri = uri;

        if (!targetUri) {
            const speUri = await this.getUriSpecial();
            if (!speUri) {
                this.isCalculating = false;
                return;
            }
            await this.calculateFolder(speUri);
            log.info(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculated by Keyboard Shortcut",
                ),
            );
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

            if (FolderCalculator.isCancelled) {
                log.info(
                    vscode.l10n.t(
                        "[Calculate Folder Command] Calculation cancelled, result discarded",
                    ),
                );
                return;
            }

            this.showResult(result);
            this.hasResult = true;
        } catch (error) {
            if (error instanceof CalculationCancelledError) {
                log.info(
                    vscode.l10n.t(
                        "[Calculate Folder Command] Calculation cancelled, result discarded",
                    ),
                );
                return;
            }
            log.error(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculation failed: {0}",
                    error instanceof Error ? error.message : String(error),
                ),
            );
            this.hideStatusBar();
        } finally {
            this.isCalculating = false;
        }
    }

    /**
     * 特殊方式-剪贴板中转（经测试，并不会污染剪贴板条目）
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
        this.statusBarItem.text = "$(loading~spin) " + folderName; // 一个旋转的加载图标，此时不允许点击
        this.statusBarItem.show();
    }

    /**
     * 显示计算结果
     */
    private showResult(result: any): void {
        this.clearDismissTimer();

        const statusText = Formatters.formatForStatusBar(result);

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
