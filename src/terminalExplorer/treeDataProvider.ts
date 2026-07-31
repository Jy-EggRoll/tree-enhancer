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

        // 文件节点可点击打开
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
    implements vscode.TreeDataProvider<TerminalFileTreeItem>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        TerminalFileTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _cwd?: vscode.Uri;

    /**
     * 设置当前工作目录并刷新整棵树
     * @param uri 新的 CWD URI，或 undefined 表示清空树
     */
    public setCwd(uri: vscode.Uri | undefined): void {
        this._cwd = uri;
        this._onDidChangeTreeData.fire(); // undefined 参数触发全量刷新
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
     * 获取父节点，用于树视图的 "Reveal" 功能
     */
    public getParent(
        element: TerminalFileTreeItem,
    ): vscode.ProviderResult<TerminalFileTreeItem> {
        const parentUri = vscode.Uri.joinPath(element.uri, "..");
        // 如果到达 CWD 根则返回 null（无父节点）
        if (
            this._cwd &&
            parentUri.fsPath === element.uri.fsPath
        ) {
            return null;
        }
        // 简化处理：不支持在树中定位到具体父节点的 TreeItem
        // VS Code 的 reveal 会使用 getParent 链来找到元素位置
        return null;
    }

    public dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
