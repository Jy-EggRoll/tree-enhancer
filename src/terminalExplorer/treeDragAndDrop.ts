import * as vscode from "vscode";
import type { TerminalFileTreeItem, TerminalFileTreeProvider } from "./treeDataProvider";

/**
 * 本树专属 mime 类型，用于树内拖放传输源节点。
 * 格式遵循官方推荐：application/vnd.code.tree.<treeidlowercase>
 */
const TREE_MIME = "application/vnd.code.tree.terminalexplorer";

/**
 * 覆盖确认对话框文案（与官方 getFileOverwriteConfirm 保持一致的语义）
 */
function getOverwriteConfirmMessage(existing: string[]): string {
    return existing.length === 1
        ? vscode.l10n.t(
            "A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?",
            existing[0],
        )
        : vscode.l10n.t(
            "The following {0} files and/or folders already exist in the destination folder. Do you want to replace them?",
            String(existing.length),
        );
}

/**
 * 树内拖放 + OS 拖入上传控制器。
 * 行为对齐 VSCode 官方 Explorer：
 *  - 树内拖动 = 移动（尊重 explorer.confirmDragAndDrop 设置，冲突时弹覆盖确认）
 *  - OS 拖入文件 = 上传到拖放位置所在目录
 */
export class TerminalFileDragAndDrop
    implements vscode.TreeDragAndDropController<TerminalFileTreeItem>
{
    /**
     * 支持接收的 mime 类型：
     *  - 本树 mime：树内拖动源
     *  - files：OS 拖入的所有类型文件
     */
    public readonly dropMimeTypes: readonly string[] = [
        TREE_MIME,
        "files",
        "text/uri-list",
    ];

    /**
     * 拖出时附加的类型。本树 mime 会被自动添加，无需重复声明，
     * 保留 text/uri-list 以支持拖入编辑器等场景。
     */
    public readonly dragMimeTypes: readonly string[] = ["text/uri-list"];

    constructor(private treeProvider: TerminalFileTreeProvider) {}

    /**
     * 拖拽开始时，将源节点放入树 mime，供同树 handleDrop 取回。
     */
    public handleDrag(
        source: readonly TerminalFileTreeItem[],
        dataTransfer: vscode.DataTransfer,
    ): void {
        dataTransfer.set(TREE_MIME, new vscode.DataTransferItem([...source]));
    }

    /**
     * 拖放落点处理：
     *  - 同树拖动（存在本树 mime）→ 移动
     *  - OS 拖入（files/text/uri-list）→ 上传
     */
    public async handleDrop(
        target: TerminalFileTreeItem | undefined,
        dataTransfer: vscode.DataTransfer,
    ): Promise<void> {
        // 树内拖动：源节点在本树 mime 中，执行移动
        const treeItem = dataTransfer.get(TREE_MIME);
        if (treeItem) {
            const sources = treeItem.value as TerminalFileTreeItem[];
            await this.handleMove(sources, target);
            return;
        }

        // OS 拖入：上传文件
        await this.handleUpload(target, dataTransfer);
    }

    // -----------------------------------------------------------------
    // 树内移动
    // -----------------------------------------------------------------

    private async handleMove(
        sources: TerminalFileTreeItem[],
        target: TerminalFileTreeItem | undefined,
    ): Promise<void> {
        const targetDir = this.resolveTargetDir(target);
        if (!targetDir || sources.length === 0) {
            return;
        }

        // 校验：不能移动自身、不能移入自己的后代目录
        const valid = sources.filter((source) => {
            if (source.uri.toString() === targetDir.toString()) {
                return false; // 移到自身
            }
            if (this.isSourceParentOfTarget(source.uri, targetDir)) {
                return false; // 目标位于源内部，会导致循环
            }
            return true;
        });
        if (valid.length === 0) {
            return;
        }

        // 尊重 explorer.confirmDragAndDrop：移动前确认
        const confirmMove = vscode.workspace
            .getConfiguration("explorer")
            .get<boolean>("confirmDragAndDrop", true);
        if (confirmMove) {
            const targetName = target ? this.getName(target) : targetDir.fsPath;
            const message = valid.length === 1
                ? vscode.l10n.t("Are you sure you want to move '{0}' into '{1}'?", this.getName(valid[0]), targetName)
                : vscode.l10n.t("Are you sure you want to move the following {0} files into '{1}'?", String(valid.length), targetName);
            const choice = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                vscode.l10n.t("Move"),
            );
            if (!choice) {
                return;
            }
        }

        // 检查目标是否存在同名项
        const targets = valid.map((source) => ({
            source,
            destination: vscode.Uri.joinPath(targetDir, this.getName(source)),
        }));
        // 跳过目标与源相同的条目（拖到自己的父目录）
        const uniqueTargets = targets.filter(
            ({ source, destination }) =>
                source.uri.toString() !== destination.toString(),
        );
        const conflicts = [];
        for (const { destination } of uniqueTargets) {
            if (await this.exists(destination)) {
                conflicts.push(destination);
            }
        }
        if (conflicts.length > 0) {
            const confirm = await vscode.window.showWarningMessage(
                getOverwriteConfirmMessage(conflicts.map((u) => u.path.split("/").pop() || "")),
                { modal: true },
                vscode.l10n.t("Replace"),
            );
            if (!confirm) {
                return;
            }
        }

        // 执行移动
        for (const { source, destination } of uniqueTargets) {
            try {
                await vscode.workspace.fs.rename(source.uri, destination, {
                    overwrite: true,
                });
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t("Failed to move: {0}", error instanceof Error ? error.message : String(error)),
                );
            }
        }
        this.treeProvider.refresh();
    }

    // -----------------------------------------------------------------
    // OS 拖入上传
    // -----------------------------------------------------------------

    private async handleUpload(
        target: TerminalFileTreeItem | undefined,
        dataTransfer: vscode.DataTransfer,
    ): Promise<void> {
        const targetDir = this.resolveTargetDir(target);
        if (!targetDir) {
            return;
        }

        // 收集拖入的文件
        const files: { name: string; uri?: vscode.Uri; data?: Thenable<Uint8Array> }[] = [];
        const uriList = dataTransfer.get("text/uri-list");
        if (uriList) {
            // text/uri-list：字符串形式的 URI 列表（OS 拖入的标准形式）
            const text = await uriList.asString();
            for (const line of text.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) {
                    continue;
                }
                try {
                    const uri = vscode.Uri.parse(trimmed);
                    const name = uri.path.split("/").pop() || "file";
                    files.push({ name, uri });
                } catch {
                    // 忽略无法解析的行
                }
            }
        }
        for (const [, item] of dataTransfer) {
            const file = item.asFile();
            if (file) {
                const existing = files.find((f) => f.name === file.name);
                if (existing) {
                    // 同一文件同时出现在 uri-list 与 files 中时，优先保留 uri（可走 fs.copy）
                    if (!existing.uri) {
                        existing.uri = file.uri;
                        existing.data = file.data();
                    }
                } else {
                    files.push({ name: file.name, uri: file.uri, data: file.data() });
                }
            }
        }
        if (files.length === 0) {
            return;
        }

        // 检查目标是否存在同名项
        const destinations = files.map((f) => vscode.Uri.joinPath(targetDir, f.name));
        const conflicts = [];
        for (const destination of destinations) {
            if (await this.exists(destination)) {
                conflicts.push(destination);
            }
        }
        if (conflicts.length > 0) {
            const confirm = await vscode.window.showWarningMessage(
                getOverwriteConfirmMessage(conflicts.map((u) => u.path.split("/").pop() || "")),
                { modal: true },
                vscode.l10n.t("Replace"),
            );
            if (!confirm) {
                return;
            }
        }

        // 执行上传
        let firstUploadedFile: vscode.Uri | undefined;
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("Uploading"),
            },
            async () => {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const destination = destinations[i];
                    try {
                        if (file.uri) {
                            // 源为本地文件 URI，走 fs.copy（与官方 ExternalFileImport 一致）
                            await vscode.workspace.fs.copy(file.uri, destination, {
                                overwrite: true,
                            });
                        } else if (file.data) {
                            // 无 URI（如 Web 场景），读字节后写入
                            await vscode.workspace.fs.writeFile(
                                destination,
                                await file.data,
                            );
                        }
                        firstUploadedFile = firstUploadedFile ?? destination;
                    } catch (error) {
                        vscode.window.showErrorMessage(
                            vscode.l10n.t("Failed to upload '{0}': {1}", file.name, error instanceof Error ? error.message : String(error)),
                        );
                    }
                }
            },
        );
        this.treeProvider.refresh();

        // 对齐官方 BrowserFileUpload.doUpload：仅上传单个文件时，
        // 尊重 explorer.autoOpenDroppedFile 决定是否自动打开
        if (firstUploadedFile && files.length === 1) {
            const autoOpen = vscode.workspace
                .getConfiguration("explorer")
                .get<boolean>("autoOpenDroppedFile", true);
            if (autoOpen) {
                await vscode.commands.executeCommand(
                    "vscode.open",
                    firstUploadedFile,
                );
            }
        }
    }

    // -----------------------------------------------------------------
    // 私有工具方法
    // -----------------------------------------------------------------

    /**
     * 解析拖放目标目录：
     *  - 拖到文件夹上 → 该文件夹
     *  - 拖到文件上 → 该文件所在目录
     *  - 拖到空白区域 → 当前 CWD 根目录
     */
    private resolveTargetDir(
        target: TerminalFileTreeItem | undefined,
    ): vscode.Uri | undefined {
        if (target) {
            return target.isDirectory
                ? target.uri
                : vscode.Uri.joinPath(target.uri, "..");
        }
        return this.treeProvider.cwd;
    }

    private getName(treeItem: TerminalFileTreeItem | undefined): string {
        if (!treeItem) {
            return "";
        }
        return (treeItem.label as string) || treeItem.uri.path.split("/").pop() || "";
    }

    /**
     * 判断 candidate 是否为 self 自身或 self 的后代（路径前缀匹配）。
     * 用于阻止把文件夹移动到自己内部造成循环。
     * 使用 fsPath 比较：在 Windows（大小写不敏感文件系统）上更可靠，
     * 避免 URI path 大小写差异导致的误判。
     */
    private isSourceParentOfTarget(self: vscode.Uri, candidate: vscode.Uri): boolean {
        const selfPath = self.fsPath.replace(/[\\/]$/, "");
        const candidatePath = candidate.fsPath.replace(/[\\/]$/, "");
        if (candidatePath === selfPath) {
            return true;
        }
        return candidatePath.startsWith(selfPath + "/") ||
            candidatePath.startsWith(selfPath + "\\");
    }

    private async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}
