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
import { TerminalFileDragAndDrop } from "./terminalExplorer/treeDragAndDrop";
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

        // 排除相关配置变化（followExcludes 开关或 files.exclude）时刷新树
        const excludeConfigDisposable =
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (
                    event.affectsConfiguration(
                        "tree-enhancer.terminalExplorer.followExcludes",
                    ) ||
                    event.affectsConfiguration("files.exclude")
                ) {
                    terminalTreeProvider.onExcludeConfigChanged();
                }
            });
        context.subscriptions.push(excludeConfigDisposable);

        // 创建终端文件树的拖放控制器（树内移动 + OS 拖入上传）
        // 尊重 explorer.enableDragAndDrop：设为 false 时不注册控制器，禁用拖放
        // 注：TreeView 的 dragAndDropController 仅在创建时确定，无法在运行时动态切换，
        // 因此该设置变更需重启生效（官方 explorer 虽实时响应，但扩展 API 无动态接口）。
        const enableDragAndDrop = vscode.workspace
            .getConfiguration("explorer")
            .get<boolean>("enableDragAndDrop", true);
        const dragAndDrop = enableDragAndDrop
            ? new TerminalFileDragAndDrop(terminalTreeProvider)
            : undefined;

        const treeView = vscode.window.createTreeView(
            "tree-enhancer.terminalExplorer",
            {
                treeDataProvider: terminalTreeProvider,
                showCollapseAll: true,
                canSelectMany: true,
                dragAndDropController: dragAndDrop,
            },
        );

        // 创建文件操作命令处理器
        const fileOps = new FileOperationHandlers(
            terminalTreeProvider,
            context.globalState,
        );

        // 辅助函数：获取操作目标项列表
        // 对齐官方资源管理器右键语义（treeView.ts onContextMenu）：
        // 右键点击不会改变 treeView.selection（selection 只读），但命令收到的 treeItem 是右键项。
        //  - 右键项在当前选中集中 → 操作整个选中集（多选批量）
        //  - 右键项不在选中集中 → 只操作该右键项
        // 无右键项（标题栏按钮触发）→ 使用当前选中集
        const getSelection = (treeItem?: TerminalFileTreeItem): TerminalFileTreeItem[] => {
            const selection = [...treeView.selection] as TerminalFileTreeItem[];
            if (treeItem) {
                const isInSelection = selection.some(
                    (item) => item.uri.toString() === treeItem.uri.toString(),
                );
                return isInSelection ? selection : [treeItem];
            }
            return selection;
        };

        // 注册文件操作命令
        // 注意：
        //  - newFile/newFolder/rename 只作用于"右键项所在位置"，不应受选中集影响。
        //    若传 getSelection(treeItem)，多选时（如选中 [A,B] 再右键 B）
        //    可能定位/重命名到选中集首项 A，与用户意图不符。
        //  - delete/download 支持多选批量，故传整个选中集。
        const newFileCommand = vscode.commands.registerCommand(
            "tree-enhancer.newFile",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.newFile(treeItem ? [treeItem] : []);
            },
        );
        const newFolderCommand = vscode.commands.registerCommand(
            "tree-enhancer.newFolder",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.newFolder(treeItem ? [treeItem] : []);
            },
        );
        const renameCommand = vscode.commands.registerCommand(
            "tree-enhancer.rename",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.rename(treeItem ? [treeItem] : []);
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
        const downloadCommand = vscode.commands.registerCommand(
            "tree-enhancer.download",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.download(getSelection(treeItem));
            },
        );

        context.subscriptions.push(newFileCommand);
        context.subscriptions.push(newFolderCommand);
        context.subscriptions.push(renameCommand);
        context.subscriptions.push(deleteCommand);
        context.subscriptions.push(deletePermanentlyCommand);
        context.subscriptions.push(downloadCommand);

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