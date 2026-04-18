import * as vscode from "vscode";
import * as os from "os";
import { log } from "../utils/func";
import { FolderCalculationResult } from "../types";

const MAX_CONCURRENCY = Math.max(1, Math.floor(os.cpus().length / 2));

export class CalculationCancelledError extends Error {
    constructor() {
        super("Calculation cancelled");
        this.name = "CalculationCancelledError";
    }
}

class Semaphore {
    private queue: Array<() => void> = [];

    constructor(private permits: number) {}

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise((resolve) => {
            this.queue.push(() => {
                this.permits--;
                resolve();
            });
        });
    }

    release(): void {
        this.permits++;
        const next = this.queue.shift();
        if (next) {
            next();
        }
    }
}

/**
 * 文件夹计算器类，负责递归计算文件夹的大小、文件数量等统计信息
 */
export class FolderCalculator {
    private static semaphore = new Semaphore(MAX_CONCURRENCY);
    private static _cancelled = false;

    public static get isCancelled(): boolean {
        return this._cancelled;
    }

    public static cancel(): void {
        this._cancelled = true;
    }

    public static resetCancel(): void {
        this._cancelled = false;
    }
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

        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        try {
            // 递归计算文件夹内容
            const result = await this.calculateRecursive(folderUri);
            totalSize = result.totalSize;
            fileCount = result.fileCount;
            folderCount = result.folderCount;
        } catch (error) {
            if (error instanceof CalculationCancelledError) {
                throw error;
            }
            throw error;
        }

        const duration = Date.now() - startTime;
        const cpuCount = os.cpus().length;
        const concurrency = MAX_CONCURRENCY;
        log.info(
            vscode.l10n.t(
                "[Folder Calculator] Calculation {0} completed in {1}ms: {2} files, {3} folders, {4} bytes | CPU cores: {5}, Max concurrency: {6}",
                folderName,
                duration,
                fileCount,
                folderCount,
                totalSize,
                cpuCount,
                concurrency,
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
        if (this._cancelled) {
            throw new CalculationCancelledError();
        }

        const entries = await vscode.workspace.fs.readDirectory(uri);

        if (this._cancelled) {
            throw new CalculationCancelledError();
        }

        const files: vscode.Uri[] = [];
        const folders: vscode.Uri[] = [];

        for (const [name, type] of entries) {
            const entryUri = vscode.Uri.joinPath(uri, name);
            if (type === vscode.FileType.File) {
                files.push(entryUri);
            } else if (type === vscode.FileType.Directory) {
                folders.push(entryUri);
            }
        }

        await this.semaphore.acquire();
        let fileStats: number[];
        try {
            fileStats = await Promise.all(
                files.map((f) => this.getFileSizeSafe(f)),
            );
        } finally {
            this.semaphore.release();
        }

        const folderResults: Array<{
            totalSize: number;
            fileCount: number;
            folderCount: number;
        }> = [];
        for (const folder of folders) {
            if (this._cancelled) {
                throw new CalculationCancelledError();
            }
            folderResults.push(await this.calculateRecursiveSafe(folder));
        }

        const totalSize = fileStats.reduce((a, b) => a + b, 0) +
            folderResults.reduce((acc, r) => acc + r.totalSize, 0);
        const fileCount = fileStats.filter((s) => s >= 0).length +
            folderResults.reduce((acc, r) => acc + r.fileCount, 0);
        const folderCount = folders.length +
            folderResults.reduce((acc, r) => acc + r.folderCount, 0);

        return { totalSize, fileCount, folderCount };
    }

    private static async getFileSizeSafe(
        uri: vscode.Uri,
    ): Promise<number> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return stat.size;
        } catch (error) {
            log.warn(
                vscode.l10n.t(
                    "[Folder Calculator] Failed to access file: {0}, error: {1}",
                    uri.fsPath,
                    error instanceof Error ? error.message : String(error),
                ),
            );
            return -1;
        }
    }

    private static async calculateRecursiveSafe(
        uri: vscode.Uri,
    ): Promise<{ totalSize: number; fileCount: number; folderCount: number }> {
        try {
            return await this.calculateRecursive(uri);
        } catch (error) {
            if (error instanceof CalculationCancelledError) {
                throw error;
            }
            log.warn(
                vscode.l10n.t(
                    "[Folder Calculator] Failed to access directory: {0}, error: {1}",
                    uri.fsPath,
                    error instanceof Error ? error.message : String(error),
                ),
            );
            return { totalSize: 0, fileCount: 0, folderCount: 0 };
        }
    }
}
