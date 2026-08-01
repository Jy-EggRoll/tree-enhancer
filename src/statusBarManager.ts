import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { getLogger } from "./utils/func";

const log = getLogger();

/**
 * 状态栏管理器，统一管理文件和文件夹信息的显示
 * 同一个 status bar item，根据当前选中内容切换显示
 */
export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private dismissTimer?: NodeJS.Timeout;
    private _isShowing = false;
    /** 当前显示的内容是否需要自动消失（文件信息/文件夹结果=true，计算中=false） */
    private dismissEnabled = false;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            -2000 // 确保排在最后一个，和我的另一个插件兼容
        );
        this.statusBarItem.command = {
            command: "tree-enhancer.dismissStatusBar",
            title: "Dismiss",
        };
    }

    public get isShowing(): boolean {
        return this._isShowing;
    }

    /**
     * 显示文件信息
     */
    public showFileInfo(fileName: string, fileSize: string, modifiedTime: string): void {
        this.clearDismissTimer();
        this.statusBarItem.text = `$(file) ${fileName} | ${fileSize} | ${modifiedTime}`;
        this.statusBarItem.tooltip = vscode.l10n.t("Click to dismiss");
        this.statusBarItem.show();
        this._isShowing = true;
        this.dismissEnabled = true;
        this.scheduleDismiss();
    }

    /**
     * 显示文件夹计算中状态
     */
    public showCalculating(folderName: string): void {
        this.clearDismissTimer();
        this.statusBarItem.text = "$(loading~spin) " + folderName;
        this.statusBarItem.show();
        this._isShowing = true;
        this.dismissEnabled = false;
    }

    /**
     * 显示文件夹计算结果
     */
    public showFolderResult(text: string): void {
        this.clearDismissTimer();
        this.statusBarItem.text = `$(folder) ${text}`;
        this.statusBarItem.tooltip = vscode.l10n.t("Click to dismiss");
        this.statusBarItem.show();
        this._isShowing = true;
        this.dismissEnabled = true;
        this.scheduleDismiss();
    }

    /**
     * 隐藏状态栏
     */
    public hide(): void {
        this.clearDismissTimer();
        this.statusBarItem.hide();
        this._isShowing = false;
        this.dismissEnabled = false;
    }

    /**
     * 配置变化后由集中式配置监听调用：
     * 若当前正在显示需要自动消失的内容（文件信息/文件夹结果），
     * 按最新 dismissDelay 重新调度，使 dismissDelay 修改即时生效。
     * 计算中/未显示时不做任何事。
     */
    public restartDismissTimer(): void {
        if (this._isShowing && this.dismissEnabled) {
            this.clearDismissTimer();
            this.scheduleDismiss();
        }
    }

    /**
     * 调度自动消失
     */
    private scheduleDismiss(): void {
        const delay = ConfigManager.getStatusBarDismissDelay();
        if (delay === 0) {
            log.debug(
                vscode.l10n.t(
                    "[StatusBar Manager] Auto-dismiss disabled, will not auto-dismiss",
                ),
            );
            return;
        }
        this.dismissTimer = setTimeout(() => {
            this.hide();
            log.debug(
                vscode.l10n.t(
                    "[StatusBar Manager] Auto-dismissed after {0} seconds",
                    delay,
                ),
            );
        }, delay * 1000);
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
        this.statusBarItem.dispose();
    }
}