import * as vscode from "vscode";
import {
  isExcludedByConfig,
  readExcludePatterns,
} from "../utils/excludeMatcher";

/**
 * 终端文件树节点，复用 VSCode 内置 ThemeIcon 以保持与原生文件浏览器一致的视觉风格。
 * 目录节点可折叠（懒加载），文件节点可直接点击打开。
 * 符号链接的行最右侧 ⤷ 徽标与 tooltip 由 FileDecorationProvider 统一提供
 *（工作区内走官方、工作区外走自建逻辑），此处只负责常规路径显示。
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

    this.iconPath = isDirectory
      ? vscode.ThemeIcon.Folder
      : vscode.ThemeIcon.File;

    this.resourceUri = uri;

    if (!isDirectory) {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri],
      };
    }

    this.contextValue = isDirectory ? "folder" : "file";
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

  /** 是否遵循 files.exclude（由 tree-enhancer.terminalExplorer.followExcludes 控制） */
  private followExcludes: boolean = false;

  /** 已启用的 files.exclude 模式（与官方资源管理器显示规则一致） */
  private excludePatterns: string[] = [];

  constructor() {
    this.reloadExcludeConfig();
  }

  /**
   * 加载 followExcludes 开关与 files.exclude 配置。
   * 开关关闭时不加载排除模式（树显示全部内容）。
   */
  private reloadExcludeConfig(): void {
    this.followExcludes = vscode.workspace
      .getConfiguration("tree-enhancer.terminalExplorer")
      .get<boolean>("followExcludes", false);

    if (!this.followExcludes) {
      this.excludePatterns = [];
      return;
    }

    this.excludePatterns = readExcludePatterns();
  }

  /**
   * 判断 uri 是否命中 files.exclude。
   * 仅在 followExcludes 开启时生效；对工作区外的路径不过滤
   * （与官方一致：工作区外的路径无相对根可依，官方同样不过滤）。
   *
   * 关闭后代兜底匹配：树是懒加载的，被排除目录不会展开，其后代不会进入
   * 判断点；若开启兜底，当终端 CWD 本身位于某个排除目录之内时
   * （例如 CWD = sub/node_modules），当前层的所有子项都会被判定为已排除，
   * 导致整棵树显示为空。
   */
  private isExcluded(uri: vscode.Uri): boolean {
    if (!this.followExcludes) {
      return false;
    }

    return isExcludedByConfig(uri, this.excludePatterns, {
      matchDescendants: false,
    });
  }

  /**
   * 公开当前工作目录，供外部组件（如文件操作）在无选中项时回退使用
   */
  public get cwd(): vscode.Uri | undefined {
    return this._cwd;
  }

  /**
   * 设置当前工作目录并刷新整棵树。
   * 目录的文件系统监控由 extension.ts 统一负责（变更时同时刷新树与文件装饰），
   * 本类只维护 CWD 与树数据本身。
   * @param uri 新的 CWD URI。传 undefined 时忽略本次调用，保留原 CWD
   *            （调用方 TerminalTracker 已保证回退到工作区根目录或用户主目录，
   *             因此此处不会出现"无 CWD 可显示"的情况）
   */
  public setCwd(uri: vscode.Uri | undefined): void {
    if (!uri) return;
    this._cwd = uri;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 处理排除相关配置变更（followExcludes 开关或 files.exclude）：
   * 重载模式并刷新整棵树。
   */
  public onExcludeConfigChanged(): void {
    this.reloadExcludeConfig();
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: TerminalFileTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 获取子节点。根节点（element 为 undefined）返回 CWD 下的内容，
   * 其他节点返回对应目录下的内容。
   * readDirectory 对符号链接返回 目标类型|SymbolicLink 的位掩码，故目录判断改用位运算而非 ===，避免符号链接目录（Directory|SymbolicLink=66）被误判。
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
      const items = entries.map(([name, type]) => {
        const uri = vscode.Uri.joinPath(dirUri, name);
        const isDirectory = (type & vscode.FileType.Directory) !== 0;
        return new TerminalFileTreeItem(uri, isDirectory);
      });

      return (
        items
          // 遵循 files.exclude（仅当 followExcludes 开关开启时）
          .filter((item) => !this.isExcluded(item.uri))
          .sort((a, b) => {
            // 目录优先，同类型按名称字母序排列
            if (a.isDirectory !== b.isDirectory) {
              return a.isDirectory ? -1 : 1;
            }
            return (a.label as string).localeCompare(b.label as string);
          })
      );
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
   * 刷新节点。传入 TreeItem 只刷新该节点（及其子节点），
   * 不传参数则全量刷新整棵树。
   * 供文件操作（新建/重命名/删除）完成后调用。
   */
  public refresh(element?: TerminalFileTreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  public dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
