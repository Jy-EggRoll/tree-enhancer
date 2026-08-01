import * as vscode from "vscode";
import { getLogger } from "../utils/func";
import type { FolderCalculationResult } from "../types";

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
    /** 最近一次计算结果的缓存，供配置热加载后按最新模板重新渲染 */
    private lastResult?: FolderCalculationResult;

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
     * 重新开始计算（从选中项）。
     * 注意：命令必须携带目标文件夹 uri 调用（右键菜单来源），不再支持无参快捷键触发。
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
        }

        this.isCalculating = true;
        FolderCalculator.resetCancel();

        if (!uri) {
            // 无目标 uri（例如从命令面板手动触发）时无法确定要计算哪个文件夹，直接放弃。
            // 曾支持过 alt+enter 快捷键无参触发，依赖下方被注释的剪贴板中转方案，现已移除。
            this.isCalculating = false;
            return;
        }

        await this.calculateFolder(uri);
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
     * 奇技淫巧（HACK）- 已停用，仅保留代码供参考，请勿重新启用！
     *
     * 剪贴板中转方案：利用官方 "copyFilePath" 命令间接获取“资源管理器当前选中项”的路径。
     *
     * 说明：
     * 1. 仅在 Windows 上经过完善测试确认无副作用（不会污染剪贴板）。
     * 2. 不推荐作为常规写法：依赖剪贴板状态与 VSCode 内部命令的行为细节，
     *    一旦 VSCode 官方调整 "copyFilePath" 或剪贴板 API，极易产生难以排查的竞态问题。
     *
     * 曾用于支持 alt+enter 快捷键无参触发命令（已随该功能一并移除）。
     */
    // private async getUriSpecial(): Promise<vscode.Uri | undefined> {
    //     const originalClipboard = await vscode.env.clipboard.readText();
    //     await vscode.commands.executeCommand("copyFilePath");
    //     const copiedPath = await vscode.env.clipboard.readText();
    //     await vscode.env.clipboard.writeText(originalClipboard); // 恢复原始剪贴板内容
    //
    //     if (copiedPath && copiedPath !== originalClipboard) {
    //         return vscode.Uri.file(copiedPath);
    //     }
    //
    //     return undefined;
    // }

    /**
     * 显示计算结果
     */
    private showResult(result: FolderCalculationResult): void {
        this.lastResult = result;
        const statusText = Formatters.formatForStatusBar(result);
        this.statusBarManager.showFolderResult(statusText);

        log.debug(
            vscode.l10n.t(
                "[Calculate Folder Command] Result displayed",
            ),
        );
    }

    /**
     * 配置热加载后重新渲染当前结果显示（若存在）。
     * 由 extension.ts 集中式配置监听在 statusBarTemplate / fileSizeBase 变化时调用，
     * 使正在显示的结果立即按最新模板刷新，无需重启或重新计算。
     */
    public refreshDisplay(): void {
        if (this.hasResult && this.lastResult) {
            this.showResult(this.lastResult);
        }
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