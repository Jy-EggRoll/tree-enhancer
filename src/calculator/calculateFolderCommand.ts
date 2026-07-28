import * as vscode from "vscode";
import { getLogger } from "../utils/func";

const log = getLogger();
import { FolderCalculator, CalculationCancelledError } from "./folderCalculator";
import { Formatters } from "../utils/formatters";
import { StatusBarManager } from "../statusBarManager";

/**
     * 文件夹计算命令处理器
 */
export class CalculateFolderCommand {
    private statusBarManager: StatusBarManager;
    private isCalculating = false;
    private hasResult = false;

    constructor(statusBarManager: StatusBarManager) {
        this.statusBarManager = statusBarManager;
    }

    public get isRunning(): boolean {
        return this.isCalculating;
    }

    public get hasResultDisplayed(): boolean {
        return this.hasResult;
    }

    /**
     * 取消当前计算
     */
    public cancel(): void {
        if (this.isCalculating) {
            FolderCalculator.cancel();
            this.statusBarManager.hide();
            this.isCalculating = false;
            log.debug(
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
            this.statusBarManager.hide();
            this.isCalculating = false;
            log.debug(
                vscode.l10n.t(
                    "[Calculate Folder Command] Calculation cancelled by user",
                ),
            );
        } else if (this.hasResult) {
            this.statusBarManager.hide();
            this.hasResult = false;
            log.debug(
                vscode.l10n.t(
                    "[Calculate Folder Command] Result dismissed, starting new calculation",
                ),
            );
        } else if (uri) {
            log.debug(
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
            log.debug(
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
        this.statusBarManager.showCalculating(folderName);

        try {
            const result = await FolderCalculator.calculate(folderUri);

            if (FolderCalculator.isCancelled) {
                log.debug(
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
                log.debug(
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
            this.statusBarManager.hide();
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
     * 显示计算结果
     */
    private showResult(result: any): void {
        const statusText = Formatters.formatForStatusBar(result);
        this.statusBarManager.showFolderResult(statusText);

        log.debug(
            vscode.l10n.t(
                "[Calculate Folder Command] Result displayed",
            ),
        );
    }

    /**
     * 隐藏状态栏（外部调用，例如 dismiss 命令）
     */
    public hideStatusBar(): void {
        this.statusBarManager.hide();
        this.hasResult = false;
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        // StatusBarManager 由 extension.ts 统一管理
    }
}