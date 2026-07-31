import * as vscode from "vscode";
import type { TerminalFileTreeItem, TerminalFileTreeProvider } from "./treeDataProvider";
import { getLogger } from "../utils/func";

const log = getLogger();

/**
 * 文件操作命令处理器。
 * 为终端文件浏览器提供新建、重命名、删除等基础文件操作。
 * 支持多选批量操作（仅适用于 delete、deletePermanently）。
 */
export class FileOperationHandlers {
    private treeProvider: TerminalFileTreeProvider;

    constructor(treeProvider: TerminalFileTreeProvider) {
        this.treeProvider = treeProvider;
    }

    /**
     * 新建文件。
     * 有选中项时在其所在目录创建；无选中项时在当前 CWD 根目录创建（标题栏按钮触发）。
     */
    public async newFile(items: TerminalFileTreeItem[]): Promise<void> {
        const parentDir = this.getParentDir(items);
        if (!parentDir) {
            return;
        }
        const fileName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Enter file name"),
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
     * 有选中项时在其所在目录创建；无选中项时在当前 CWD 根目录创建（标题栏按钮触发）。
     */
    public async newFolder(items: TerminalFileTreeItem[]): Promise<void> {
        const parentDir = this.getParentDir(items);
        if (!parentDir) {
            return;
        }
        const folderName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Enter folder name"),
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
     * 检查文件是否在 dirty（未保存）的编辑器中打开
     */
    private hasUnsavedChanges(uri: vscode.Uri): boolean {
        return vscode.window.visibleTextEditors.some(
            (editor) => editor.document.uri.fsPath === uri.fsPath && editor.document.isDirty,
        );
    }

    private getBaseNameSelection(fileName: string): [number, number] {
        const dotIndex = fileName.lastIndexOf(".");
        if (dotIndex > 0) {
            return [0, dotIndex];
        }
        return [0, fileName.length];
    }

    private validateFileName(name: string, _parentDir: vscode.Uri): string | null {
        if (!name || name.trim().length === 0) {
            return vscode.l10n.t("Name cannot be empty");
        }
        if (/[/\\:*?"<>|]/.test(name)) {
            return vscode.l10n.t("Name contains invalid characters: / \\ : * ? \" < > |");
        }
        return null;
    }

    private validateRename(newName: string, oldName: string, _uri: vscode.Uri): string | null {
        if (!newName || newName.trim().length === 0) {
            return vscode.l10n.t("Name cannot be empty");
        }
        if (newName === oldName) {
            return vscode.l10n.t("New name is the same as the current name");
        }
        if (/[/\\:*?"<>|]/.test(newName)) {
            return vscode.l10n.t("Name contains invalid characters: / \\ : * ? \" < > |");
        }
        return null;
    }
}
