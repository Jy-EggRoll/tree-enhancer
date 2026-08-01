import * as vscode from "vscode";
import type { TerminalFileTreeItem, TerminalFileTreeProvider } from "./treeDataProvider";
import { getLogger } from "../utils/func";

const log = getLogger();

/**
 * 记忆上次下载目录的全局存储键，行为对齐官方 Explorer 的
 * LAST_USED_DOWNLOAD_PATH_STORAGE_KEY（官方存储于 APPLICATION scope）。
 */
const LAST_DOWNLOAD_PATH_KEY = "tree-enhancer.terminalExplorer.downloadPath";

/**
 * 文件操作命令处理器。
 * 为终端文件浏览器提供新建、重命名、删除、下载等基础文件操作。
 * 支持多选批量操作（仅适用于 delete、deletePermanently、download）。
 */
export class FileOperationHandlers {
    private treeProvider: TerminalFileTreeProvider;
    private globalState: vscode.Memento;

    constructor(treeProvider: TerminalFileTreeProvider, globalState: vscode.Memento) {
        this.treeProvider = treeProvider;
        this.globalState = globalState;
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
        const fileName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t(
                "Enter a name for the new file in {0}",
                parentDir.fsPath,
            ),
            placeHolder: "example.txt",
            validateInput: (value) => this.validateFileName(value, parentDir),
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
        const folderName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t(
                "Enter a name for the new folder in {0}",
                parentDir.fsPath,
            ),
            placeHolder: "new-folder",
            validateInput: (value) => this.validateFileName(value, parentDir),
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
        const newName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Enter new name"),
            value: oldName,
            valueSelection: treeItem.isDirectory
                ? undefined
                : this.getBaseNameSelection(oldName),
            validateInput: (value) => this.validateRename(value, oldName, treeItem.uri),
        });
        if (!newName || newName === oldName) {
            return;
        }

        // 检查是否有未保存更改：重命名磁盘文件会孤立 dirty editor
        if (!treeItem.isDirectory && this.hasUnsavedChanges(treeItem.uri)) {
            const proceed = await vscode.window.showWarningMessage(
                vscode.l10n.t("'{0}' has unsaved changes. Renaming will abandon them. Continue?", oldName),
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
     * 行为对齐官方 Explorer 的 explorer.download（FileDownload.doDownloadNative）：
     *  - 弹出保存对话框，默认目录记忆上次下载位置
     *  - 通过 workspace.fs.copy 将远程文件复制到本地目标
     *  - 多选时逐个弹窗，用户取消一个则取消剩余
     */
    public async download(items: TerminalFileTreeItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }

        for (const item of items) {
            const name = this.getName(item);

            // 计算默认保存路径：记忆的下载目录 + 文件名；无记忆时回退到默认位置
            const lastDownloadPath = this.globalState.get<string>(LAST_DOWNLOAD_PATH_KEY);
            let defaultUri: vscode.Uri;
            if (lastDownloadPath) {
                defaultUri = vscode.Uri.joinPath(vscode.Uri.file(lastDownloadPath), name);
            } else {
                defaultUri = vscode.Uri.joinPath(
                    vscode.Uri.file(this.getDefaultDirectory()),
                    name,
                );
            }

            const destination = await vscode.window.showSaveDialog({
                saveLabel: vscode.l10n.t("Download"),
                title: vscode.l10n.t("Choose Where to Download"),
                defaultUri,
            });
            if (!destination) {
                // 用户取消一个下载，取消剩余（与官方 #86100 行为一致）
                return;
            }

            // 记忆本次下载目录，供下次使用（等价官方 dirname(destination).fsPath）
            await this.globalState.update(
                LAST_DOWNLOAD_PATH_KEY,
                vscode.Uri.joinPath(destination, "..").fsPath,
            );

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
                    vscode.l10n.t("Failed to download '{0}': {1}", name, errMsg),
                );
            }
        }
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
                    "Trash is not available for '{0}'. Would you like to permanently delete it instead?",
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
            ? vscode.l10n.t("Are you sure you want to delete folder '{0}' and all its contents?", name)
            : vscode.l10n.t("Are you sure you want to delete file '{0}'?", name);
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
     * 获取默认下载目录（用户主目录）。
     * 对齐官方 FileDownload 默认路径行为（native 使用默认文件/文件夹路径）。
     */
    private getDefaultDirectory(): string {
        return process.env.HOME || process.env.USERPROFILE || ".";
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
            vscode.l10n.t("A file or folder with the name '{0}' already exists in this location.", name),
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
            vscode.l10n.t("A file or folder with the name '{0}' already exists in this location.", newName),
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
