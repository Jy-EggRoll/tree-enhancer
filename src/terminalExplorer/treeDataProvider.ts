import * as vscode from "vscode";
import { getLogger } from "../utils/func";

const log = getLogger();

/**
 * 终端文件树节点，复用 VSCode 内置 ThemeIcon 以保持与原生文件浏览器一致的视觉风格。
 * 目录节点可折叠（懒加载），文件节点可直接点击打开。
 */
export class TerminalFileTreeItem extends vscode.TreeItem {
    public readonly uri: vscode.Uri;
    public readonly isDirectory: boolean;

    constructor(uri: vscode.Uri, isDirectory: boolean) {
        const name = uri.path.split("/").pop() || "";
        super(
            name,
            isDirectory
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );

        this.uri = uri;
        this.isDirectory = isDirectory;

        // 使用 VSCode 内置图标，与原生文件浏览器风格一致
        this.iconPath = isDirectory
            ? vscode.ThemeIcon.Folder
            : vscode.ThemeIcon.File;

        // 设置 resourceUri 以复用用户的文件图标主题
        // 当 ThemeIcon + resourceUri 同时存在时，VSCode 根据文件扩展名匹配图标（如 .ts 显示 TS 图标）
        this.resourceUri = uri;

        // 文件节点可点击打开（TreeView 自动根据 workbench.list.openMode 决定单击/双击触发）
        if (!isDirectory) {
            this.command = {
                command: "vscode.open",
                title: "Open File",
                arguments: [uri],
            };
        }

        // contextValue 用于右键菜单的条件匹配
        this.contextValue = isDirectory ? "folder" : "file";

        // 悬浮提示显示完整路径
        this.tooltip = uri.fsPath;
    }
}

/**
 * TreeDataProvider 实现，根据 terminalTracker 提供的 CWD 构建文件树。
 * 仅展开时读取目录内容（懒加载），保证性能。
 */
export class TerminalFileTreeProvider
    implements
        vscode.TreeDataProvider<TerminalFileTreeItem>,
        vscode.TreeDragAndDropController<TerminalFileTreeItem>,
        vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        TerminalFileTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // 拖放：树内部专用 MIME，仅接受来自同一树视图的拖放
    dropMimeTypes = ["application/vnd.code.tree.treeEnhancerTerminalExplorer"];
    dragMimeTypes = ["text/uri-list"];

    private _cwd?: vscode.Uri;
    private _fileWatcher?: vscode.FileSystemWatcher;

    /**
     * 公开当前工作目录，供外部组件（如文件操作）在无选中项时回退使用
     */
    public get cwd(): vscode.Uri | undefined {
        return this._cwd;
    }

    /**
     * 设置当前工作目录并刷新整棵树。
     * 同时创建文件系统监控器，当目录内文件增删改时自动刷新。
     * @param uri 新的 CWD URI，或 undefined 表示清空树
     */
    public setCwd(uri: vscode.Uri | undefined): void {
        this._cwd = uri;
        this._onDidChangeTreeData.fire();

        // 销毁旧的文件监控器
        this.disposeFileWatcher();

        // 为新目录创建文件监控器
        if (uri) {
            this.createFileWatcher(uri);
        }
    }

    /**
     * 创建文件系统监控器，监听指定目录下的文件增删改事件
     */
    private createFileWatcher(cwd: vscode.Uri): void {
        try {
            const pattern = new vscode.RelativePattern(cwd, "*");
            this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

            // 非递归监控仅监听 CWD 直接子节点，与懒加载树视图可见范围匹配
            this._fileWatcher.onDidChange(() => {
                this._onDidChangeTreeData.fire();
            });

            this._fileWatcher.onDidCreate(() => {
                this._onDidChangeTreeData.fire();
            });

            this._fileWatcher.onDidDelete(() => {
                this._onDidChangeTreeData.fire();
            });

            log.debug(
                vscode.l10n.t(
                    "[Terminal Explorer] File watcher started for: {0}",
                    cwd.fsPath,
                ),
            );
        } catch {
            // 某些文件系统可能不支持 watcher，静默忽略
            log.debug(
                vscode.l10n.t(
                    "[Terminal Explorer] File watcher not supported for: {0}",
                    cwd.fsPath,
                ),
            );
        }
    }

    /**
     * 销毁文件系统监控器
     */
    private disposeFileWatcher(): void {
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
            this._fileWatcher = undefined;
        }
    }

    public getTreeItem(element: TerminalFileTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 获取子节点。根节点（element 为 undefined）返回 CWD 下的内容，
     * 其他节点返回对应目录下的内容。
     */
    public async getChildren(
        element?: TerminalFileTreeItem,
    ): Promise<TerminalFileTreeItem[]> {
        const dirUri = element ? element.uri : this._cwd;
        if (!dirUri) {
            return [];
        }

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            return entries
                .map(([name, type]) => {
                    const uri = vscode.Uri.joinPath(dirUri, name);
                    return new TerminalFileTreeItem(
                        uri,
                        type === vscode.FileType.Directory,
                    );
                })
                .sort((a, b) => {
                    // 目录优先，同类型按名称字母序排列
                    if (a.isDirectory !== b.isDirectory) {
                        return a.isDirectory ? -1 : 1;
                    }
                    return (a.label as string).localeCompare(
                        b.label as string,
                    );
                });
        } catch {
            // 权限不足或目录不可达时静默返回空数组
            return [];
        }
    }

    /**
     * 获取父节点。当前实现始终返回 null，因为终端文件树的构建方向是自上而下的：
     * CWD 是虚拟根节点，所有路径向下派生。树视图的 reveal 功能可以正常工作
     * （通过逐个展开 getChildren 链路定位元素）。
     * 未来如果需要支持"从子节点向上查找"，可在此实现。
     */
    public getParent(
        _element: TerminalFileTreeItem,
    ): vscode.ProviderResult<TerminalFileTreeItem> {
        return null;
    }

    /**
     * 拖放：将拖拽的 TreeItem 列表编码为 DataTransfer
     */
    public handleDrag(
        source: TerminalFileTreeItem[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): void {
        const transferItem = new vscode.DataTransferItem(source);
        dataTransfer.set(
            "application/vnd.code.tree.treeEnhancerTerminalExplorer",
            transferItem,
        );
    }

    /**
     * 拖放：将拖拽项移动到目标目录，通过 workspace.fs.rename 实现批量移动
     */
    public async handleDrop(
        target: TerminalFileTreeItem | undefined,
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        const transferItem = dataTransfer.get(
            "application/vnd.code.tree.treeEnhancerTerminalExplorer",
        );
        if (!transferItem) {
            return;
        }

        const draggedItems = transferItem.value as TerminalFileTreeItem[];
        // 目标目录：有目标时取目标所在目录（文件取其父目录），否则用 CWD
        const targetDir = target
            ? (target.isDirectory
                ? target.uri
                : vscode.Uri.joinPath(target.uri, ".."))
            : this._cwd;
        if (!targetDir) {
            return;
        }

        for (const item of draggedItems) {
            const name = item.uri.path.split("/").pop();
            if (!name) {
                continue;
            }
            const newUri = vscode.Uri.joinPath(targetDir, name);

            // 跳过同路径或同名冲突
            if (newUri.fsPath === item.uri.fsPath) {
                continue;
            }
            try {
                await vscode.workspace.fs.rename(item.uri, newUri, {
                    overwrite: false,
                });
            } catch {
                // 权限不足或目标已存在等，静默跳过
            }
        }
        this._onDidChangeTreeData.fire();
    }

    /**
     * 刷新节点。传入 TreeItem 只刷新该节点（及其子节点），
     * 不传参数则全量刷新整棵树。
     * 供文件操作（新建/重命名/删除）完成后调用。
     */
    public refresh(element?: TerminalFileTreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }

    public dispose(): void {
        this.disposeFileWatcher();
        this._onDidChangeTreeData.dispose();
    }
}
