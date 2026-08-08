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
    // 初始开关在构造时传入，之后由集中式配置监听统一控制启停
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
    // 兼容两种调用来源的传参：
    //  - 官方资源管理器右键：传 vscode.Uri
    //  - 终端文件树右键（view/item/context）：传 TerminalFileTreeItem
    // 统一在此归一化为 Uri，再交给处理器执行。
    const calculateCommand = vscode.commands.registerCommand(
        "tree-enhancer.calculateFolder",
        (target?: vscode.Uri | TerminalFileTreeItem) => {
            const uri =
                target instanceof vscode.Uri
                    ? target
                    : target?.uri;
            calculateFolderCommandHandler.execute(uri);
        },
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
    // 提升为外部引用，供下方集中式配置监听区访问（未启用时为 undefined）
    let terminalTreeProvider: TerminalFileTreeProvider | undefined;
    if (ConfigManager.getTerminalExplorerEnabled()) {
        terminalTreeProvider = new TerminalFileTreeProvider();
        const terminalTracker = new TerminalTracker();

        // 当终端 CWD 变化时，刷新树视图
        terminalTracker.onDidChangeCwd((cwd) => {
            terminalTreeProvider!.setCwd(cwd);
        });

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
        // 下载仅远程模式可用，不再需要 globalState（无下载目录记忆）
        const fileOps = new FileOperationHandlers(
            terminalTreeProvider,
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
        const copyPathCommand = vscode.commands.registerCommand(
            "tree-enhancer.copyPath",
            (treeItem?: TerminalFileTreeItem) => {
                fileOps.copyPath(getSelection(treeItem));
            },
        );
        const openFolderInNewWindowCommand = vscode.commands.registerCommand(
            "tree-enhancer.openFolderInNewWindow",
            (treeItem?: TerminalFileTreeItem) => {
                if (treeItem) {
                    fileOps.openFolderInNewWindow(treeItem);
                }
            },
        );
        const openWorkspaceInNewWindowCommand = vscode.commands.registerCommand(
            "tree-enhancer.openWorkspaceInNewWindow",
            (treeItem?: TerminalFileTreeItem) => {
                if (treeItem) {
                    fileOps.openWorkspaceInNewWindow(treeItem);
                }
            },
        );
        // 顶栏按钮：打开当前根目录（无参，内部取终端 CWD）
        const openCurrentFolderCommand = vscode.commands.registerCommand(
            "tree-enhancer.openCurrentFolder",
            () => {
                fileOps.openCurrentFolder();
            },
        );

        // 顶栏按钮：强制刷新整个文件树。
        // 由于 watcher 采用非递归模式（treeDataProvider.ts 中 RelativePattern(cwd, "*")），
        // 深层的文件增删不会触发自动刷新，故提供手动强制刷新入口：
        // 全量 fire 让已展开节点重新懒加载 readDirectory。
        const refreshTerminalExplorerCommand = vscode.commands.registerCommand(
            "tree-enhancer.refreshTerminalExplorer",
            () => {
                terminalTreeProvider?.refresh();
            },
        );

        context.subscriptions.push(newFileCommand);
        context.subscriptions.push(newFolderCommand);
        context.subscriptions.push(renameCommand);
        context.subscriptions.push(deleteCommand);
        context.subscriptions.push(deletePermanentlyCommand);
        context.subscriptions.push(downloadCommand);
        context.subscriptions.push(copyPathCommand);
        context.subscriptions.push(openFolderInNewWindowCommand);
        context.subscriptions.push(openWorkspaceInNewWindowCommand);
        context.subscriptions.push(openCurrentFolderCommand);
        context.subscriptions.push(refreshTerminalExplorerCommand);

        context.subscriptions.push(terminalTracker);
        context.subscriptions.push(terminalTreeProvider);
        context.subscriptions.push(treeView);
    }

    log.debug(
        vscode.l10n.t(
            "[Activation Complete] Extension has been successfully activated",
        ),
    );

    // ===== 集中式配置热加载监听区 =====
    // 设计约定：所有需要在运行时实时响应配置变更的监听统一注册在此，
    // 各模块（SelectionMonitor / StatusBarManager / CalculateFolderCommand /
    // TerminalFileTreeProvider / FileDecorationProvider）不得再自行注册
    // onDidChangeConfiguration，避免再次出现"改设置需重启才生效"的漏监听问题。
    // 新增响应式设置时，在此添加对应的 affectsConfiguration 分支即可。
    //
    // 文件装饰提供者与文件监控器为延迟启动（startupDelay），在此用可选引用访问，
    // 配置监听在延迟启动完成前就已生效。
    let fileWatcherManager: FileWatcherManager | undefined;
    let fileDecorationProvider: FileDecorationProvider | undefined;

    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
        (event) => {
            // 1. 状态栏文件信息显示开关：实时启停，无需重启
            if (event.affectsConfiguration("tree-enhancer.fileInfo.enabled")) {
                selectionMonitor.setEnabled(
                    ConfigManager.getFileInfoEnabled(),
                );
            }

            // 2. 文件夹计算状态栏显示相关配置：
            //    - statusBarTemplate 变化 → 按最新模板重渲染当前结果
            //    - dismissDelay 变化 → 按最新延迟重置当前倒计时
            //    - fileSizeBase 变化 → 重算当前结果与文件信息的大小单位
            const folderCalcConfigChanged =
                event.affectsConfiguration(
                    "tree-enhancer.folderCalculator.statusBarTemplate",
                ) ||
                event.affectsConfiguration(
                    "tree-enhancer.folderCalculator.dismissDelay",
                ) ||
                event.affectsConfiguration("tree-enhancer.fileSizeBase");
            if (folderCalcConfigChanged) {
                calculateFolderCommandHandler.refreshDisplay();
                statusBarManager.restartDismissTimer();
            }

            // 2b. 文件信息显示的大小单位/日期格式变化 → 刷新当前文件信息
            //     （fileSizeBase、dateTimeFormat 同时影响状态栏文件信息显示）
            if (
                event.affectsConfiguration("tree-enhancer.fileSizeBase") ||
                event.affectsConfiguration("tree-enhancer.dateTimeFormat")
            ) {
                selectionMonitor.refreshCurrentFile();
            }

            // 3. 终端文件树的排除规则变化（followExcludes 开关或 files.exclude）→ 刷新树
            if (
                event.affectsConfiguration(
                    "tree-enhancer.terminalExplorer.followExcludes",
                ) ||
                event.affectsConfiguration("files.exclude")
            ) {
                terminalTreeProvider?.onExcludeConfigChanged();
            }

            // 4. 文件装饰相关配置（fileTemplate / imageFileTemplate /
            //    imageResolutionTemplate / largeFileThreshold / fileSizeBase /
            //    dateTimeFormat 等，粗粒度）：全量刷新装饰
            //    装饰提供者每次 provideFileDecoration 都实时读取配置，
            //    只需触发重新拉取即可生效
            if (ConfigManager.isConfigChanged(event)) {
                fileDecorationProvider?.refreshAll();
                log.debug(
                    vscode.l10n.t(
                        "[Config Changed] Refreshing all file decorations",
                    ),
                );
            }

            // 5. 文件监控排除规则（files.exclude）变化 → 重载监控
            if (event.affectsConfiguration("files.exclude")) {
                fileWatcherManager?.reload();
                log.debug(
                    vscode.l10n.t(
                        "[Config Changed] Exclude patterns reloaded",
                    ),
                );
            }
        },
    );
    context.subscriptions.push(configChangeDisposable);

    // 延迟启动文件装饰提供者
    const startupTimer = setTimeout(() => {
        fileWatcherManager = new FileWatcherManager();
        fileDecorationProvider = new FileDecorationProvider(fileWatcherManager);
        const providerDisposable = vscode.window.registerFileDecorationProvider(
            fileDecorationProvider,
        );

        const folder = vscode.workspace.workspaceFolders?.[0];
        let fileWatcher: vscode.FileSystemWatcher | undefined;
        if (folder) {
            fileWatcher = fileWatcherManager.createWatcher(
                folder,
                (uri) => {
                    fileDecorationProvider!.refreshSpecific(uri);
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
                    fileDecorationProvider!.refreshSpecific(uri);
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