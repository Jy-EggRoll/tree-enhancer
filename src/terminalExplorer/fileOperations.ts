import * as vscode from "vscode";
import type { TerminalFileTreeItem, TerminalFileTreeProvider } from "./treeDataProvider";
import { ConfigManager } from "../config";
import { getLogger } from "../utils/func";

const log = getLogger();

/**
 * 文件操作命令处理器。
 * 为终端文件浏览器提供新建、重命名、删除、下载等基础文件操作。
 * 支持多选批量操作（仅适用于 delete、deletePermanently、download）。
 */
export class FileOperationHandlers {
    private treeProvider: TerminalFileTreeProvider;

    constructor(treeProvider: TerminalFileTreeProvider) {
        this.treeProvider = treeProvider;
    }

    /**
     * 新建文件。
     * 标题栏触发时固定创建在当前 CWD 根目录；右键菜单触发时创建在选中项所在目录。
     * 输入框中明确提示实际创建位置，避免用户建完找不到。
     */
    public async newFile(items: TerminalFileTreeItem[]): Promise<void> {
        const parentDir = this.getParentDir(items);
        if (!parentDir) {
            return;
        }
        const fileName = await this.showNameInputBox({
            title: vscode.l10n.t("New File"),
            prompt: vscode.l10n.t(
                "Enter a name for the new file in {0}",
                parentDir.fsPath,
            ),
            placeholder: "example.txt",
            validate: (value) => this.validateFileName(value, parentDir),
        });
        if (!fileName) {
            return;
        }

        try {
            const newUri = vscode.Uri.joinPath(parentDir, fileName);
            await vscode.workspace.fs.writeFile(newUri, new Uint8Array());
            this.treeProvider.refresh();
            await vscode.commands.executeCommand("vscode.open", newUri);
        } catch (error) {
            vscode.window.showErrorMessage(
                vscode.l10n.t("Failed to create file: {0}", error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * 新建文件夹。
     * 标题栏触发时固定创建在当前 CWD 根目录；右键菜单触发时创建在选中项所在目录。
     * 输入框中明确提示实际创建位置。
     */
    public async newFolder(items: TerminalFileTreeItem[]): Promise<void> {
        const parentDir = this.getParentDir(items);
        if (!parentDir) {
            return;
        }
        const folderName = await this.showNameInputBox({
            title: vscode.l10n.t("New Folder"),
            prompt: vscode.l10n.t(
                "Enter a name for the new folder in {0}",
                parentDir.fsPath,
            ),
            placeholder: "new-folder",
            validate: (value) => this.validateFileName(value, parentDir),
        });
        if (!folderName) {
            return;
        }

        try {
            const newUri = vscode.Uri.joinPath(parentDir, folderName);
            await vscode.workspace.fs.createDirectory(newUri);
            this.treeProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(
                vscode.l10n.t("Failed to create folder: {0}", error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * 重命名文件或文件夹（仅处理第一个选中的项）
     */
    public async rename(items: TerminalFileTreeItem[]): Promise<void> {
        const treeItem = items[0];
        if (!treeItem) {
            return;
        }
        const oldName = this.getName(treeItem);
        const newName = await this.showNameInputBox({
            title: vscode.l10n.t("Rename"),
            prompt: vscode.l10n.t("Enter new name"),
            value: oldName,
            valueSelection: treeItem.isDirectory
                ? undefined
                : this.getBaseNameSelection(oldName),
            validate: (value) => this.validateRename(value, oldName, treeItem.uri),
        });
        if (!newName || newName === oldName) {
            return;
        }

        // 检查是否有未保存更改：重命名磁盘文件会孤立 dirty editor
        if (!treeItem.isDirectory && this.hasUnsavedChanges(treeItem.uri)) {
            const proceed = await vscode.window.showWarningMessage(
                vscode.l10n.t("{0} has unsaved changes. Renaming will abandon them. Continue?", oldName),
                { modal: true },
                vscode.l10n.t("Continue"),
            );
            if (!proceed) {
                return;
            }
        }

        try {
            const parentUri = vscode.Uri.joinPath(treeItem.uri, "..");
            const newUri = vscode.Uri.joinPath(parentUri, newName);
            await vscode.workspace.fs.rename(treeItem.uri, newUri);
            this.treeProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(
                vscode.l10n.t("Failed to rename: {0}", error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * 删除文件/文件夹（尝试移动到回收站）
     * 尊重 VSCode 自带文件树的 explorer.confirmDelete 设置：
     *   设为 false 时跳过确认直接删除；设为 true 时弹出确认对话框。
     * 支持多选批量删除。
     */
    public async delete(items: TerminalFileTreeItem[]): Promise<void> {
        // 读取 VSCode 自带文件树的删除确认配置，默认开启确认
        const confirmDelete = vscode.workspace
            .getConfiguration("explorer")
            .get<boolean>("confirmDelete", true);

        await this.doDelete(items, {
            useTrash: true,
            confirmMessage: vscode.l10n.t("Move to Trash"),
            skipConfirmation: !confirmDelete,
        });
    }

    /**
     * 永久删除文件/文件夹（不经过回收站）
     * 始终显示确认对话框（与 VSCode Shift+Delete 行为一致）。
     * 支持多选批量删除。
     */
    public async deletePermanently(items: TerminalFileTreeItem[]): Promise<void> {
        await this.doDelete(items, {
            useTrash: false,
            confirmMessage: vscode.l10n.t("Delete Permanently"),
            skipConfirmation: false,
        });
    }

    /**
     * 下载文件/文件夹到本地。
     * 仅在 VSCode 远程模式下可见（package.json 菜单 when: remoteName != ''）。
     * 注意：remoteName 在本地窗口的值是空字符串 ''（而非 null），官方定义见
     * vscode 源码 contextkeys.ts 的 RemoteNameContext，故必须用 != '' 判断，
     * 用 != null 在本地会恒为 true 导致按钮误显示。
     * 物理机本地文件系统不提供下载（本地文件复制无意义）。
     * 行为对齐官方 Explorer 的 explorer.download（FileDownload.doDownloadNative）：
     *  - 弹出保存对话框，默认目录为用户主目录
     *  - 通过 workspace.fs.copy 将远程文件复制到本地目标
     *  - 多选时逐个弹窗，用户取消一个则取消剩余
     */
    public async download(items: TerminalFileTreeItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }

        for (const item of items) {
            const name = this.getName(item);

            // 默认保存路径：源文件自身的路径。
            // 对话框默认定位在远程文件系统的源文件位置；若用户直接确认，
            // destination == item.uri，fs.copy 复制到自身不会产生副本，无副作用。
            // 要真正保存到物理机，用户需手动切换到对话框的"查看本地"选择路径。
            const defaultUri = item.uri;

            const destination = await vscode.window.showSaveDialog({
                saveLabel: vscode.l10n.t("Download"),
                title: vscode.l10n.t(
                    "The filesystem is still remote. To download to your local machine, choose a local location.",
                ),
                defaultUri,
            });
            if (!destination) {
                // 用户取消一个下载，取消剩余（与官方 #86100 行为一致）
                return;
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: vscode.l10n.t("Downloading"),
                    },
                    () =>
                        vscode.workspace.fs.copy(item.uri, destination, {
                            overwrite: true,
                        }),
                );
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(
                    vscode.l10n.t("Failed to download {0}: {1}", name, errMsg),
                );
            }
        }
    }

    /**
     * 在新窗口中打开文件夹。
     * 等价于在终端执行 `code <路径>`：通过官方内置命令 vscode.openFolder 实现，
     * 传入 forceNewWindow: true 强制新窗口打开。
     * 注意：vscode.openFolder 以同一窗口打开会关闭当前扩展宿主进程，
     * 因此一律使用新窗口，避免中断本扩展的运行。
     * 远程环境下传入的 uri 为 vscode-remote://，会在新窗口以远程宿主打开。
     */
    public async openFolderInNewWindow(item: TerminalFileTreeItem): Promise<void> {
        if (!item.isDirectory) {
            return;
        }
        await vscode.commands.executeCommand("vscode.openFolder", item.uri, {
            forceNewWindow: true,
        });
    }

    /**
     * 在新窗口中打开当前根目录（终端 CWD）。
     * 供顶栏按钮使用（无树项参数）；无活动终端/CWD 时静默返回。
     * 打开方式与 openFolderInNewWindow 相同（vscode.openFolder + forceNewWindow）。
     */
    public async openCurrentFolder(): Promise<void> {
        const cwd = this.treeProvider.cwd;
        if (!cwd) {
            return;
        }
        await vscode.commands.executeCommand("vscode.openFolder", cwd, {
            forceNewWindow: true,
        });
    }

    /**
     * 在新窗口中打开文件夹下的工作区。
     * 优先查找所选文件夹顶层的 .code-workspace 文件：
     *  - 找到多个 → QuickPick 让用户选择
     *  - 恰好一个 → 直接打开
     *  - 没有 → 提示未找到
     * 打开方式与 openFolderInNewWindow 相同（vscode.openFolder 支持 workspace 文件 URI）。
     */
    public async openWorkspaceInNewWindow(item: TerminalFileTreeItem): Promise<void> {
        if (!item.isDirectory) {
            return;
        }

        let workspaceFiles: vscode.Uri[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(item.uri);
            workspaceFiles = entries
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".code-workspace"))
                .map(([name]) => vscode.Uri.joinPath(item.uri, name));
        } catch (error) {
            vscode.window.showErrorMessage(
                vscode.l10n.t(
                    "Failed to list workspace files in {0}: {1}",
                    item.uri.fsPath,
                    error instanceof Error ? error.message : String(error),
                ),
            );
            return;
        }

        if (workspaceFiles.length === 0) {
            vscode.window.showWarningMessage(
                vscode.l10n.t(
                    "No .code-workspace file found in {0}.",
                    item.uri.fsPath,
                ),
            );
            return;
        }

        let target: vscode.Uri;
        if (workspaceFiles.length === 1) {
            target = workspaceFiles[0];
        } else {
            const picked = await vscode.window.showQuickPick(
                workspaceFiles.map((uri) => ({
                    label: uri.path.split("/").pop() || uri.fsPath,
                    description: uri.fsPath,
                    uri,
                })),
                {
                    title: vscode.l10n.t(
                        "Select a workspace file to open in a new window",
                    ),
                    placeHolder: vscode.l10n.t(
                        "Select a workspace file to open in a new window",
                    ),
                    matchOnDescription: true,
                },
            );
            if (!picked) {
                return;
            }
            target = picked.uri;
        }

        await vscode.commands.executeCommand("vscode.openFolder", target, {
            forceNewWindow: true,
        });
    }

    /**
     * 复制路径到剪贴板。
     * 支持多选（; 分隔），是否加双引号由 tree-enhancer.terminalExplorer.copyPathQuote 控制。
     */
    public async copyPath(items: TerminalFileTreeItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }
        const quote = ConfigManager.getCopyPathQuote();
        const paths = items.map((item) => item.uri.fsPath);
        const text = paths.length === 1
            ? (quote ? `"${paths[0]}"` : paths[0])
            : paths.map((p) => quote ? `"${p}"` : p).join(";");
        await vscode.env.clipboard.writeText(text);
    }

    // -----------------------------------------------------------------
    // 私有方法
    // -----------------------------------------------------------------

    /**
     * 获取父目录 URI。
     * 有选中项时取其所在目录；无选中项时回退到当前 CWD（供标题栏按钮使用）。
     */
    private getParentDir(items: TerminalFileTreeItem[]): vscode.Uri | undefined {
        if (items.length > 0) {
            const treeItem = items[0];
            return treeItem.isDirectory ? treeItem.uri : vscode.Uri.joinPath(treeItem.uri, "..");
        }
        return this.treeProvider.cwd;
    }

    /**
     * 统一的删除实现，支持多选
     * @param skipConfirmation 设为 true 时跳过确认对话框（尊重 explorer.confirmDelete）
     */
    private async doDelete(
        items: TerminalFileTreeItem[],
        options: { useTrash: boolean; confirmMessage: string; skipConfirmation: boolean },
    ): Promise<void> {
        if (items.length === 0) {
            return;
        }

        // 尊重用户配置：不提示时直接执行，否则弹出确认对话框
        if (!options.skipConfirmation) {
            const names = items.map((item) => this.getName(item));
            const confirmText = items.length === 1
                ? this.getSingleDeleteMessage(names[0], items[0].isDirectory)
                : vscode.l10n.t(
                    "Are you sure you want to delete {0} items?",
                    String(items.length),
                );

            const choice = await vscode.window.showWarningMessage(
                confirmText,
                { modal: true },
                options.confirmMessage,
            );
            if (!choice) {
                return;
            }
        }

        // 逐个删除
        for (const item of items) {
            if (options.useTrash) {
                await this.deleteWithTrashFallback(item);
            } else {
                await this.deleteDirect(item);
            }
        }

        this.treeProvider.refresh();
    }

    /**
     * 尝试移至回收站，失败则询问用户是否彻底删除。
     * 策略：不对错误类型做任何假设，任何失败都走询问流程——语言无关、API 实现无关。
     */
    private async deleteWithTrashFallback(item: TerminalFileTreeItem): Promise<void> {
        try {
            await vscode.workspace.fs.delete(item.uri, {
                recursive: item.isDirectory,
                useTrash: true,
            });
        } catch {
            // 回收站失败（任何原因），询问用户是否彻底删除
            const permChoice = await vscode.window.showWarningMessage(
                vscode.l10n.t(
                    "Trash is not available for {0}. Would you like to permanently delete it instead?",
                    this.getName(item),
                ),
                { modal: true },
                vscode.l10n.t("Delete Permanently"),
            );
            if (permChoice) {
                await this.deleteDirect(item);
            }
        }
    }

    /**
     * 直接永久删除（不经过回收站），仅处理 IO 权限等硬错误
     */
    private async deleteDirect(item: TerminalFileTreeItem): Promise<void> {
        try {
            await vscode.workspace.fs.delete(item.uri, {
                recursive: item.isDirectory,
                useTrash: false,
            });
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
                vscode.l10n.t("Failed to delete: {0}", errMsg),
            );
        }
    }

    /**
     * 单文件删除的确认消息
     */
    private getSingleDeleteMessage(name: string, isDirectory: boolean): string {
        return isDirectory
            ? vscode.l10n.t("Are you sure you want to delete folder {0} and all its contents?", name)
            : vscode.l10n.t("Are you sure you want to delete file {0}?", name);
    }

    private getName(treeItem: TerminalFileTreeItem): string {
        return (treeItem.label as string) || treeItem.uri.path.split("/").pop() || "";
    }

    /**
     * 检查文件是否在 dirty（未保存）的编辑器中打开。
     * 使用 workspace.textDocuments 覆盖所有已打开文档（含后台标签页），
     * 而非仅 visibleTextEditors（会漏掉后台打开的未保存文件）。
     */
    private hasUnsavedChanges(uri: vscode.Uri): boolean {
        return vscode.workspace.textDocuments.some(
            (doc) => doc.uri.fsPath === uri.fsPath && doc.isDirty,
        );
    }

    private getBaseNameSelection(fileName: string): [number, number] {
        const dotIndex = fileName.lastIndexOf(".");
        if (dotIndex > 0) {
            return [0, dotIndex];
        }
        return [0, fileName.length];
    }

    /**
     * 通过 createInputBox 弹出带右上角关闭按钮的名称输入框。
     * 相比 showInputBox（只能 ESC 关闭），提供显式关闭按钮，
     * 使新建/重命名窗口的关闭方式与用户预期一致。
     * 校验逻辑通过 validate 回调接入，与 showInputBox 的 validateInput 语义等价。
     */
    private showNameInputBox(options: {
        title: string;
        prompt: string;
        placeholder?: string;
        value?: string;
        valueSelection?: [number, number];
        validate?: (value: string) => string | null | Thenable<string | null>;
    }): Thenable<string | undefined> {
        return new Promise<string | undefined>((resolve) => {
            const inputBox = vscode.window.createInputBox();
            inputBox.title = options.title;
            inputBox.prompt = options.prompt;
            if (options.placeholder) {
                inputBox.placeholder = options.placeholder;
            }
            if (options.value !== undefined) {
                inputBox.value = options.value;
            }
            if (options.valueSelection) {
                inputBox.valueSelection = options.valueSelection;
            }

            // 右上角关闭按钮：点击等价于 ESC 取消
            const closeButton: vscode.QuickInputButton = {
                iconPath: new vscode.ThemeIcon("close"),
                tooltip: vscode.l10n.t("Close"),
            };
            inputBox.buttons = [closeButton];

            let resolved = false;
            const finish = (value: string | undefined): void => {
                if (resolved) {
                    return;
                }
                resolved = true;
                inputBox.dispose();
                resolve(value);
            };

            // 异步校验：与 showInputBox 的 validateInput 保持一致
            const validate = (value: string): void => {
                const result = options.validate?.(value);
                if (result && typeof (result as Thenable<string | null>).then === "function") {
                    (result as Thenable<string | null>).then(
                        (msg) => {
                            inputBox.validationMessage = msg ?? undefined;
                        },
                    );
                } else {
                    inputBox.validationMessage = (result as string | null) ?? undefined;
                }
            };

            inputBox.onDidChangeValue(validate);

            // 点击关闭按钮 → 取消
            inputBox.onDidTriggerButton((button) => {
                if (button === closeButton) {
                    inputBox.hide();
                }
            });

            // 回车确认
            inputBox.onDidAccept(() => {
                finish(inputBox.value);
            });

            // 失焦/ESC/关闭按钮 → 视为取消
            inputBox.onDidHide(() => {
                finish(undefined);
            });

            // 初始值也需要先跑一次校验（对应 showInputBox 对初始 value 的即时校验）
            if (options.value !== undefined) {
                validate(options.value);
            }

            inputBox.show();
        });
    }

    /**
     * 校验新建名称：非空、非法字符、目标已存在同名项。
     * @param parentDir 目标目录（用于同名冲突校验）
     */
    private validateFileName(name: string, parentDir: vscode.Uri): string | null | Thenable<string | null> {
        if (!name || name.trim().length === 0) {
            return vscode.l10n.t("Name cannot be empty");
        }
        if (/[/\\:*?"<>|]/.test(name)) {
            return vscode.l10n.t("Name contains invalid characters: / \\ : * ? \" < > |");
        }
        // 对齐官方资源管理器：目标位置已存在同名文件/文件夹时提示冲突
        // （vscode.window.showInputBox 的 validateInput 支持异步校验）
        return this.checkExists(
            vscode.Uri.joinPath(parentDir, name),
            vscode.l10n.t("A file or folder with the name {0} already exists in this location.", name),
        );
    }

    /**
     * 校验重命名新名称：非空、未变更、非法字符、目标已存在同名项。
     */
    private validateRename(
        newName: string,
        oldName: string,
        uri: vscode.Uri,
    ): string | null | Thenable<string | null> {
        if (!newName || newName.trim().length === 0) {
            return vscode.l10n.t("Name cannot be empty");
        }
        if (newName === oldName) {
            return vscode.l10n.t("New name is the same as the current name");
        }
        if (/[/\\:*?"<>|]/.test(newName)) {
            return vscode.l10n.t("Name contains invalid characters: / \\ : * ? \" < > |");
        }
        // 重命名成目标目录已存在的另一个名字时提示冲突
        const parentUri = vscode.Uri.joinPath(uri, "..");
        const targetUri = vscode.Uri.joinPath(parentUri, newName);
        if (targetUri.toString() === uri.toString()) {
            return null;
        }
        return this.checkExists(
            targetUri,
            vscode.l10n.t("A file or folder with the name {0} already exists in this location.", newName),
        );
    }

    /**
     * 异步检查目标是否已存在，存在时返回冲突提示，否则返回 null。
     */
    private checkExists(
        uri: vscode.Uri,
        conflictMessage: string,
    ): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            vscode.workspace.fs.stat(uri).then(
                () => resolve(conflictMessage),
                () => resolve(null),
            );
        });
    }
}
