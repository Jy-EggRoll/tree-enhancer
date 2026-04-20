import * as vscode from "vscode";
import * as os from "os";
import { log } from "../utils/func";
import { FolderCalculationResult } from "../types";

export class CalculationCancelledError extends Error {
    constructor() {
        super("Calculation cancelled");
        this.name = "CalculationCancelledError";
    }
}

export class FolderCalculator {
    private static _cancelled = false;
    private static _maxConcurrency = 0;
    private static _currentConcurrency = 0;

    public static get isCancelled(): boolean {
        return this._cancelled;
    }

    public static cancel(): void {
        this._cancelled = true;
    }

    public static resetCancel(): void {
        this._cancelled = false;
    }

    public static async calculate(
        folderUri: vscode.Uri,
    ): Promise<FolderCalculationResult> {
        const startTime = Date.now();
        this._maxConcurrency = 0;
        this._currentConcurrency = 0;
        const folderName = folderUri.path.split("/").pop() || folderUri.path;
        const folderStat = await vscode.workspace.fs.stat(folderUri);
        const modifiedTime = folderStat.mtime;

        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        try {
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

        log.info(
            vscode.l10n.t(
                "[Folder Calculator] Max concurrency: {0}",
                this._maxConcurrency,
            ),
        );

        return { folderName, totalSize, fileCount, folderCount, modifiedTime };
    }

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

        const fileStats = await Promise.all(
            files.map(async (f) => {
                this._currentConcurrency++;
                if (this._currentConcurrency > this._maxConcurrency) {
                    this._maxConcurrency = this._currentConcurrency;
                }
                try {
                    return await this.getFileSizeSafe(f);
                } finally {
                    this._currentConcurrency--;
                }
            }),
        );

        const folderResults = await Promise.all(
            folders.map(async (folder) => {
                if (this._cancelled) {
                    throw new CalculationCancelledError();
                }
                this._currentConcurrency++;
                if (this._currentConcurrency > this._maxConcurrency) {
                    this._maxConcurrency = this._currentConcurrency;
                }
                try {
                    return await this.calculateRecursiveSafe(folder);
                } finally {
                    this._currentConcurrency--;
                }
            }),
        );

        const totalSize = fileStats.reduce((a, b) => a + b, 0) +
            folderResults.reduce((acc, r) => acc + r.totalSize, 0);
        const fileCount = fileStats.filter((s) => s >= 0).length +
            folderResults.reduce((acc, r) => acc + r.fileCount, 0);
        const folderCount = folders.length +
            folderResults.reduce((acc, r) => acc + r.folderCount, 0);

        return { totalSize, fileCount, folderCount };
    }

    private static async getFileSizeSafe(uri: vscode.Uri): Promise<number> {
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