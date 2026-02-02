import * as vscode from "vscode";
import { log } from "../utils/func";
import { FolderCalculationResult } from "../types";

/**
 * 文件夹计算器类，负责递归计算文件夹的大小、文件数量等统计信息
 */
export class FolderCalculator {
    /**
     * 计算文件夹信息
     * @param folderUri 文件夹 URI
     * @returns 计算结果
     */
    public static async calculate(
        folderUri: vscode.Uri,
    ): Promise<FolderCalculationResult> {
        const startTime = Date.now();

        // 获取文件夹名称
        const folderName = folderUri.path.split("/").pop() || folderUri.path;

        // 获取文件夹的修改时间
        const folderStat = await vscode.workspace.fs.stat(folderUri);
        const modifiedTime = folderStat.mtime;

        // 递归计算文件夹内容
        const { totalSize, fileCount, folderCount } =
            await this.calculateRecursive(folderUri);

        const duration = Date.now() - startTime;
        log.info(
            vscode.l10n.t(
                "[Folder Calculator] Calculation {0} completed in {1}ms: {2} files, {3} folders, {4} bytes",
                folderName,
                duration,
                fileCount,
                folderCount,
                totalSize,
            ),
        );

        return {
            folderName,
            totalSize,
            fileCount,
            folderCount,
            modifiedTime,
        };
    }

    /**
     * 递归计算文件夹内容
     * @param uri 文件夹 URI
     * @returns 统计信息
     */
    private static async calculateRecursive(uri: vscode.Uri): Promise<{
        totalSize: number;
        fileCount: number;
        folderCount: number;
    }> {
        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        try {
            // 读取目录内容
            const entries = await vscode.workspace.fs.readDirectory(uri);

            // 遍历所有条目
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(uri, name);

                try {
                    if (type === vscode.FileType.File) {
                        // 文件：累加大小
                        const stat = await vscode.workspace.fs.stat(entryUri);
                        totalSize += stat.size;
                        fileCount++;
                    } else if (type === vscode.FileType.Directory) {
                        // 文件夹：递归计算
                        folderCount++;
                        const subResult =
                            await this.calculateRecursive(entryUri);
                        totalSize += subResult.totalSize;
                        fileCount += subResult.fileCount;
                        folderCount += subResult.folderCount;
                    }
                    // 忽略符号链接等其他类型
                } catch (error) {
                    // 单个文件/文件夹访问失败不影响整体计算
                    log.warn(
                        vscode.l10n.t(
                            "[Folder Calculator] Failed to access: {0}, error: {1}",
                            entryUri.fsPath,
                            error instanceof Error
                                ? error.message
                                : String(error),
                        ),
                    );
                }
            }
        } catch (error) {
            log.error(
                vscode.l10n.t(
                    "[Folder Calculator] Failed to read directory: {0}, error: {1}",
                    uri.fsPath,
                    error instanceof Error ? error.message : String(error),
                ),
            );
            throw error;
        }

        return { totalSize, fileCount, folderCount };
    }
}
