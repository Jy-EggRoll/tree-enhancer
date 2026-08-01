import * as vscode from "vscode";
import { getLogger } from "../utils/func";

const log = getLogger();

/**
 * 终端追踪器，负责监控当前活跃终端的 CWD（当前工作目录）变化。
 * 使用三级回退链获取 CWD：shell integration -> creationOptions.cwd -> workspace root。
 * CWD 变化经过 300ms 防抖后才通知订阅者，避免快速 cd 时频繁触发刷新。
 */
export class TerminalTracker implements vscode.Disposable {
    private _onDidChangeCwd = new vscode.EventEmitter<
        vscode.Uri | undefined
    >();
    readonly onDidChangeCwd = this._onDidChangeCwd.event;
    private disposables: vscode.Disposable[] = [];
    private debounceTimer?: NodeJS.Timeout;
    private _currentCwd?: vscode.Uri;

    constructor() {
        this.startTracking();
    }

    /**
     * 获取当前追踪到的 CWD，可能为 undefined（无活动终端或无法获取）
     */
    get cwd(): vscode.Uri | undefined {
        return this._currentCwd;
    }

    /**
     * 三级回退链获取终端的当前工作目录
     * 1. shell integration CWD：最准确，cd 后实时更新
     * 2. creationOptions.cwd：终端启动时的初始目录
     * 3. workspace root：工作区根目录作为最后回退
     */
    private getCwd(terminal: vscode.Terminal): vscode.Uri | undefined {
        // 第一级：shell integration 提供的实时 CWD
        const shellCwd = terminal.shellIntegration?.cwd;
        if (shellCwd) {
            return shellCwd;
        }

        // 第二级：终端创建时指定的目录
        // TerminalOptions 有 cwd 属性，ExtensionTerminalOptions 可能有也可能没有
        const opts = terminal.creationOptions;
        if ("cwd" in opts && opts.cwd) {
            const creationCwd = opts.cwd;
            return typeof creationCwd === "string"
                ? vscode.Uri.file(creationCwd)
                : creationCwd;
        }

        // 第三级：工作区根目录
        return vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    /**
     * 启动终端事件监听
     */
    private startTracking(): void {
        this.disposables.push(
            // shell integration 状态变化：cd 命令、shell 启动等
            vscode.window.onDidChangeTerminalShellIntegration(() => {
                this.scheduleRefresh();
            }),
            // 切换活动终端
            vscode.window.onDidChangeActiveTerminal(() => {
                log.debug(
                    vscode.l10n.t(
                        "[Terminal Explorer] Active terminal changed",
                    ),
                );
                this.scheduleRefresh();
            }),
            // 新终端打开
            vscode.window.onDidOpenTerminal(() => {
                log.debug(
                    vscode.l10n.t("[Terminal Explorer] Terminal opened"),
                );
                this.scheduleRefresh();
            }),
            // 终端关闭
            vscode.window.onDidCloseTerminal(() => {
                log.debug(
                    vscode.l10n.t("[Terminal Explorer] Terminal closed"),
                );
                this.scheduleRefresh();
            }),
        );

        // 启动时立即检查当前是否有活动终端
        this.scheduleRefresh();

        log.debug(
            vscode.l10n.t(
                "[Terminal Explorer] Terminal tracking started",
            ),
        );
    }

    /**
     * 安排刷新任务（300ms 防抖）
     * 避免快速切换终端或连续 cd 时频繁触发
     */
    private scheduleRefresh(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.refresh();
        }, 300);
    }

    /**
     * 执行实际的 CWD 刷新逻辑
     */
    private refresh(): void {
        const terminal = vscode.window.activeTerminal;
        if (!terminal) {
            // 无活动终端时，以工作区根目录或用户主目录作为回退，
            // 确保树始终有内容可展示，不依赖终端存在。
            const fallback =
                vscode.workspace.workspaceFolders?.[0]?.uri ??
                vscode.Uri.file(
                    process.env.HOME ||
                        process.env.USERPROFILE ||
                        "/",
                );
            if (
                !this._currentCwd ||
                this._currentCwd.fsPath !== fallback.fsPath
            ) {
                log.debug(
                    vscode.l10n.t(
                        "[Terminal Explorer] No active terminal, fallback to: {0}",
                        fallback.fsPath,
                    ),
                );
                this._currentCwd = fallback;
                this._onDidChangeCwd.fire(fallback);
            }
            return;
        }

        const cwd = this.getCwd(terminal);

        // 只处理本地文件系统 URI（不处理 vscode-remote:// 等远程 URI）
        if (cwd && cwd.scheme === "file") {
            // 仅在 CWD 实际变化时才通知
            if (cwd.fsPath !== this._currentCwd?.fsPath) {
                this._currentCwd = cwd;
                log.debug(
                    vscode.l10n.t(
                        "[Terminal Explorer] CWD changed to: {0}",
                        cwd.fsPath,
                    ),
                );
                this._onDidChangeCwd.fire(cwd);
            }
        }
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this._onDidChangeCwd.dispose();
    }
}
