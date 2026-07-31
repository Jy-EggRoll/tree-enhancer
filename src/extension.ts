import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { FileDecorationProvider } from "./provider";
import { initLogger, getLogger } from "./utils/func";
import { CalculateFolderCommand } from "./calculator/calculateFolderCommand";
import { FileWatcherManager } from "./utils/fileWatcher";
import { StatusBarManager } from "./statusBarManager";
import { SelectionMonitor } from "./selectionMonitor";
import { TerminalTracker } from "./terminalExplorer/terminalTracker";
import { TerminalFileTreeProvider, TerminalFileTreeItem } from "./terminalExplorer/treeDataProvider";
import { FileOperationHandlers } from "./terminalExplorer/fileOperations";
import sourceMapSupport from "source-map-support";

const log = getLogger();

/**
 * 扩展激活入口函数，VSCode 启动扩展/首次使用扩展功能时触发，context 为扩展上下文对象
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {
    sourceMapSupport.install();
    initLogger("Tree Enhancer");

    log.debug(vscode.l10n.t("Activating Extension: Tree Enhancer"));
    log.debug(
        vscode.l10n.t(
            "Extension Version: {0}",
            context.extension.packageJSON.version,
        ),
    );

    const startupDelay = ConfigManager.getStartupDelay() * 1000;

    // 创建统一的状态栏管理器
    const statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);

    // 创建选中监控器（自动监听文件选中并显示信息）
    const selectionMonitor = new SelectionMonitor(
        statusBarManager,
        ConfigManager.getFileInfoEnabled(),
    );
    context.subscriptions.push(selectionMonitor);

    // 创建文件夹计算命令处理器
    const calculateFolderCommandHandler = new CalculateFolderCommand(
        statusBarManager,
    );

    // 注册文件夹计算命令
    const calculateCommand = vscode.commands.registerCommand(
        "tree-enhancer.calculateFolder",
        (uri?: vscode.Uri) => calculateFolderCommandHandler.execute(uri),
    );

    // 注册 dismiss 命令
    const dismissCommand = vscode.commands.registerCommand(
        "tree-enhancer.dismissStatusBar",
        () => {
            if (calculateFolderCommandHandler.isRunning) {
                calculateFolderCommandHandler.cancel();
            } else {
                calculateFolderCommandHandler.hideStatusBar();
            }
        },
    );

    context.subscriptions.push(calculateCommand);
    context.subscriptions.push(dismissCommand);
    context.subscriptions.push(calculateFolderCommandHandler);

    // 终端文件浏览器：追踪终端 CWD 并构建自定义文件树
    if (ConfigManager.getTerminalExplorerEnabled()) {
        const terminalTracker = new TerminalTracker();
        const terminalTreeProvider = new TerminalFileTreeProvider();

        // 当终端 CWD 变化时，刷新树视图
        terminalTracker.onDidChangeCwd((cwd) => {
            terminalTreeProvider.setCwd(cwd);
        });

        const treeView = vscode.window.createTreeView(
            "tree-enhancer.terminalExplorer",
            {
                treeDataProvider: terminalTreeProvider,
                showCollapseAll: true,
                canSelectMany: true,
            },
        );

        // 创建文件操作命令处理器
        const fileOps = new FileOperationHandlers(terminalTreeProvider);

        // 辅助函数：获取操作目标项列表
        // 优先使用 TreeView 已选中的项（支持多选）；
        // 若无选中项则回退到右键菜单传递的单个项（单点右键）
        const getSelection = (treeItem?: TerminalFileTreeItem): TerminalFileTreeItem[] => {
            const selection = [...treeView.selection] as TerminalFileTreeItem[];
            if (selection.length > 0) {
                return selection;
            }
            return treeItem ? [treeItem] : [];
        };

        // 注册文件操作命令
        // newFile/newFolder：标题栏触发（无右键项）时固定创建在当前 CWD 根目录；
        // 右键菜单触发时沿用选中项所在目录。其余命令支持多选。
        const newFileCommand = vscode.commands.registerCommand(
            "tree-enhancer.newFile",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.newFile(treeItem ? getSelection(treeItem) : []);
            },
        );
        const newFolderCommand = vscode.commands.registerCommand(
            "tree-enhancer.newFolder",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.newFolder(treeItem ? getSelection(treeItem) : []);
            },
        );
        const renameCommand = vscode.commands.registerCommand(
            "tree-enhancer.rename",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.rename(getSelection(treeItem));
            },
        );
        const deleteCommand = vscode.commands.registerCommand(
            "tree-enhancer.deleteFile",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.delete(getSelection(treeItem));
            },
        );
        const deletePermanentlyCommand = vscode.commands.registerCommand(
            "tree-enhancer.deletePermanently",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.deletePermanently(getSelection(treeItem));
            },
        );

        context.subscriptions.push(newFileCommand);
        context.subscriptions.push(newFolderCommand);
        context.subscriptions.push(renameCommand);
        context.subscriptions.push(deleteCommand);
        context.subscriptions.push(deletePermanentlyCommand);

        context.subscriptions.push(terminalTracker);
        context.subscriptions.push(terminalTreeProvider);
        context.subscriptions.push(treeView);
    }

    log.debug(
        vscode.l10n.t(
            "[Activation Complete] Extension has been successfully activated",
        ),
    );

    // 延迟启动文件装饰提供者
    const startupTimer = setTimeout(() => {
        const fileWatcherManager = new FileWatcherManager();
        const fileDecorationProvider = new FileDecorationProvider(fileWatcherManager);
        const providerDisposable = vscode.window.registerFileDecorationProvider(
            fileDecorationProvider,
        );

        const configChangeDisposable =
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (ConfigManager.isConfigChanged(event)) {
                    fileDecorationProvider.refreshAll();
                    log.debug(
                        vscode.l10n.t(
                            "[Config Changed] Refreshing all file decorations",
                        ),
                    );
                    vscode.commands.executeCommand(
                        "tree-enhancer.dismissStatusBar",
                    );
                    log.debug(
                        vscode.l10n.t(
                            "[Config Changed] Dismissing status bar item",
                        ),
                    );
                }

                if (event.affectsConfiguration("files.exclude")) {
                    fileWatcherManager.reload();
                    log.debug(
                        vscode.l10n.t(
                            "[Config Changed] Exclude patterns reloaded",
                        ),
                    );
                }
            });

        const folder = vscode.workspace.workspaceFolders?.[0];
        let fileWatcher: vscode.FileSystemWatcher | undefined;
        if (folder) {
            fileWatcher = fileWatcherManager.createWatcher(
                folder,
                (uri) => {
                    fileDecorationProvider.refreshSpecific(uri);
                    log.debug(
                        vscode.l10n.t(
                            "[File Changed] {0} has been changed, corresponding file decorations have been refreshed",
                            uri.fsPath,
                        ),
                    );
                    // 如果变更的文件是当前选中的文件，刷新状态栏信息并重置超时
                    selectionMonitor.refreshCurrentFile();
                },
                (uri) => {
                    fileDecorationProvider.refreshSpecific(uri);
                    log.debug(
                        vscode.l10n.t(
                            "[File Created] {0} has been created, corresponding file decorations have been refreshed",
                            uri.fsPath,
                        ),
                    );
                    // 如果创建的文件是当前选中的文件，刷新状态栏信息并重置超时
                    selectionMonitor.refreshCurrentFile();
                },
                (uri) => {
                },
            );

            log.debug(
                vscode.l10n.t(
                    "[File Watcher] Started watching all files in workspace: {0}",
                    folder.uri.fsPath
                ),
            );
        }

        context.subscriptions.push(configChangeDisposable);
        context.subscriptions.push(providerDisposable);
        if (fileWatcher) {
            context.subscriptions.push(fileWatcher);
        }
    }, startupDelay);

    context.subscriptions.push({
        dispose: () => {
            clearTimeout(startupTimer);
        },
    });
}

export function deactivate() {}