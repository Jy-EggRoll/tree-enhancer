import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { FileUtils } from "./fileUtils";
import { Formatters } from "./formatters";
import { log } from "./funcUitls";

// 文件装饰提供者类，负责为资源管理器中的文件和文件夹提供装饰信息
export class FileDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<
        vscode.Uri | vscode.Uri[] | undefined
    >(); // 文件装饰变化事件发射器，当文件装饰需要更新时，触发此事件通知 VSCode 重新获取装饰信息
    readonly onDidChangeFileDecorations =
        this._onDidChangeFileDecorations.event;
    // private _fileCache = new Map<string, FileCacheEntry>(); // 文件信息缓存，避免重复读取文件大小和图片尺寸

    async provideFileDecoration(
        uri: vscode.Uri,
    ): Promise<vscode.FileDecoration | undefined> {
        try {
            const stats = await FileUtils.getFileStats(uri.fsPath); // 获取文件或文件夹的基本统计信息
            if (!stats) {
                log.warn(`[文件访问] 无法获取文件信息: ${uri.fsPath}`);

                return undefined;
            }
            const fileName = FileUtils.getFileName(uri.fsPath);
            const config = ConfigManager.getConfig();

            let tooltip: string;
            if (FileUtils.isDirectory(stats)) {
                // 文件夹直接跳过装饰，性能优先
                return undefined;
            }

            // 处理普通文件情况
            tooltip = await this.handleFileDecoration(
                fileName,
                stats,
                config,
                uri.fsPath,
            );

            log.info(vscode.l10n.t("[Basic Decoration] {0} decoration generated", fileName));

            // 检查是否需要添加大文件标识
            const decoration: vscode.FileDecoration = { tooltip };
            if (
                !FileUtils.isDirectory(stats) &&
                this.isLargeFile(stats.size, config)
            ) {
                decoration.badge = "L"; // 使用 L 标识大文件

                log.info(vscode.l10n.t("[Large File] {0} has been marked with L", fileName));
            }

            return decoration;
        } catch (error) {
            FileUtils.logFileError(error, uri.fsPath);
            log.error(`[提供装饰异常] 处理 ${uri.fsPath} 时发生错误：`, error);
            return undefined;
        }
    }

    private async handleFileDecoration(
        fileName: string,
        stats: vscode.FileStat,
        config: any,
        filePath: string,
    ): Promise<string> {
        if (FileUtils.isSupportedImage(fileName)) {
            const imageTemplate =
                config.imageFileTemplate || config.fileTemplate; // 使用专门的图片文件模板
            const needsImageDimensions = /{resolution}|{width}|{height}/.test(
                imageTemplate,
            );
            const imageDimensions = needsImageDimensions
                ? await FileUtils.getImageDimensions(filePath)
                : null;
            if (imageDimensions) {
                log.info(
                    vscode.l10n.t("[Image File] {0} resolution: {1} * {2}", fileName, imageDimensions.width, imageDimensions.height),
                );
            }

            const modifiedTime = new Date(stats.mtime);
            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                modifiedTime,
                imageDimensions || undefined,
            );
            return Formatters.renderTemplate(imageTemplate, variables);
        } else {
            const modifiedTime = new Date(stats.mtime);
            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                modifiedTime,
            );
            return Formatters.renderTemplate(config.fileTemplate, variables);
        }
    }

    // 检查文件是否为大文件
    private isLargeFile(fileSize: number, config: any): boolean {
        const threshold = config.largeFileThreshold || 0; // 获取大文件阈值
        if (threshold <= 0) return false; // 阈值为 0 表示关闭大文件识别

        const base = config.fileSizeBase || 1000; // 使用用户设定的单位（MB 或 MiB）
        const thresholdBytes = threshold * base * base; // 转换为字节
        return fileSize >= thresholdBytes; // 判断文件大小是否超过阈值
    }

    // 刷新所有文件装饰，触发 VSCode 重新获取所有文件的装饰信息
    public refreshAll(): void {
        this._onDidChangeFileDecorations.fire(undefined); // 触发所有文件装饰的刷新，undefined 参数表示刷新所有文件，而不是特定文件
        log.info(vscode.l10n.t("[Full Refresh] All file decorations have been re-rendered"));
    }

    // 只刷新变化的文件
    public refreshSpecific(uri: vscode.Uri): void {
        this._onDidChangeFileDecorations.fire(uri);
    }
}
