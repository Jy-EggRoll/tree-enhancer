import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { FileUtils } from "./fileUtils";
import { Formatters } from "./formatters";
import { log } from "./extension";

interface FileCacheEntry {
    // 文件缓存条目
    size: number; // 文件大小
    imageDimensions?: { width: number; height: number }; // 图片尺寸（如果是图片）
    mtime: number; // 文件修改时间
}

export class FileDecorationProvider implements vscode.FileDecorationProvider {
    // 文件装饰提供者类，负责为资源管理器中的文件和文件夹提供装饰信息
    private _onDidChangeFileDecorations = new vscode.EventEmitter<
        vscode.Uri | vscode.Uri[] | undefined
    >(); // 文件装饰变化事件发射器，当文件装饰需要更新时，触发此事件通知 VS Code 重新获取装饰信息
    readonly onDidChangeFileDecorations =
        this._onDidChangeFileDecorations.event;
    private _fileCache = new Map<string, FileCacheEntry>(); // 文件信息缓存，避免重复读取文件大小和图片尺寸

    async provideFileDecoration(
        uri: vscode.Uri,
    ): Promise<vscode.FileDecoration | undefined> {
        // 提供文件装饰信息的核心方法，VS Code 自动调用以获取文件装饰
        if (ConfigManager.isDebugMode()) {
            log.info(`[装饰请求] VS Code 请求文件装饰: ${uri.fsPath}`);
        }
        try {
            const stats = await FileUtils.getFileStats(uri.fsPath); // 获取文件或文件夹的基本统计信息
            if (!stats) {
                if (ConfigManager.isDebugMode()) {
                    console.warn(`[文件访问] 无法获取文件信息: ${uri.fsPath}`);
                } // 调试：记录无法访问的文件
                return undefined; // 无法获取文件信息
            }
            const fileName = FileUtils.getFileName(uri.fsPath);
            const config = ConfigManager.getConfig();
            const fileType = FileUtils.isDirectory(stats) ? "文件夹" : "文件"; // 确定文件类型
            if (ConfigManager.isDebugMode()) {
                log.info(
                    `[装饰流程] 处理${fileType}: ${fileName}, mtime: ${new Date(stats.mtime).toISOString()}`,
                );
            }
            let tooltip: string;
            if (FileUtils.isDirectory(stats)) {
                // 文件夹装饰性能成本过高，直接跳过装饰
                return undefined;
            }

            // 处理普通文件情况
            tooltip = await this.handleFileDecoration(
                fileName,
                stats,
                config,
                uri.fsPath,
            );
            if (ConfigManager.isDebugMode()) {
                log.info(`[装饰完成] ${fileName} 装饰生成完毕`);
            }

            // 检查是否需要添加大文件标识
            const decoration: vscode.FileDecoration = { tooltip };
            if (
                !FileUtils.isDirectory(stats) &&
                this.isLargeFile(stats.size, config)
            ) {
                // 只为文件添加大文件标识，文件夹不需要
                decoration.badge = "L"; // 使用 L 标识大文件
                decoration.color = new vscode.ThemeColor("charts.orange"); // 使用 VS Code 内置橙色
                if (ConfigManager.isDebugMode()) {
                    log.info(`[大文件标识] 为大文件 ${fileName} 添加 L 标识`);
                } // 调试：记录大文件标识
            }

            return decoration;
        } catch (error) {
            // 文件访问出错的处理
            if (ConfigManager.isDebugMode()) {
                console.error(
                    `[提供装饰异常] 处理 ${uri.fsPath} 时发生错误:`,
                    error,
                );
            } // 调试：记录装饰提供过程中的异常
            FileUtils.logFileError(error, uri.fsPath);
            return undefined;
        }
    }

    private async handleFileDecoration(
        fileName: string,
        stats: vscode.FileStat,
        config: any,
        filePath: string,
    ): Promise<string> {
        // 处理文件的装饰信息
        if (ConfigManager.isDebugMode()) {
            log.info(
                `[文件处理] 开始处理文件: ${fileName}, 大小: ${stats.size} 字节`,
            );
        } // 调试：记录开始处理文件

        // 检查文件缓存，mtime 预检查避免无意义的重复计算
        const cacheKey = filePath;
        const cached = this._fileCache.get(cacheKey);
        if (cached && cached.mtime === stats.mtime) {
            if (ConfigManager.isDebugMode()) {
                log.info(
                    `[文件缓存命中] 文件 ${fileName} mtime 未变，使用缓存`,
                );
            } // 调试：记录缓存命中
            const modifiedTime = new Date(stats.mtime);
            const variables = Formatters.createFileVariables(
                fileName,
                cached.size,
                modifiedTime,
                cached.imageDimensions,
            );
            const template = cached.imageDimensions
                ? config.imageFileTemplate || config.fileTemplate
                : config.fileTemplate;
            return Formatters.renderTemplate(template, variables);
        }

        if (FileUtils.isSupportedImage(fileName)) {
            // 检查是否为支持的图片格式
            if (ConfigManager.isDebugMode()) {
                log.info(`[图片文件] 检测到支持的图片格式: ${fileName}`);
            } // 调试：记录图片文件检测
            const imageTemplate =
                config.imageFileTemplate || config.fileTemplate; // 使用专门的图片文件模板
            const needsImageDimensions = /{resolution}|{width}|{height}/.test(
                imageTemplate,
            );
            const imageDimensions = needsImageDimensions
                ? await FileUtils.getImageDimensions(filePath)
                : null;
            if (ConfigManager.isDebugMode() && imageDimensions) {
                log.info(
                    `[图片尺寸] ${fileName} 分辨率: ${imageDimensions.width}x${imageDimensions.height}`,
                );
            } // 调试：记录图片尺寸

            // 缓存图片文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                imageDimensions: imageDimensions || undefined,
                mtime: stats.mtime,
            });

            const modifiedTime = new Date(stats.mtime);
            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                modifiedTime,
                imageDimensions || undefined,
            );
            return Formatters.renderTemplate(imageTemplate, variables);
        } else {
            // 普通文件处理
            if (ConfigManager.isDebugMode()) {
                log.info(`[普通文件] 处理普通文件: ${fileName}`);
            } // 调试：记录普通文件处理

            // 缓存普通文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                mtime: stats.mtime,
            });

            const modifiedTime = new Date(stats.mtime);
            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                modifiedTime,
            );
            return Formatters.renderTemplate(config.fileTemplate, variables);
        }
    }

    public clearAllStates(): void {
        // 清除所有内部状态，当配置发生变更时调用，清除所有缓存和计算状态
        if (ConfigManager.isDebugMode()) {
            log.info(`[状态清理] 开始清理所有内部状态`);
        } // 调试：记录状态清理开始
        const fileCacheCount = this._fileCache.size;

        this._fileCache.clear(); // 清除所有文件缓存

        if (ConfigManager.isDebugMode()) {
            // 调试：记录清理统计
            log.info(
                `[状态清理完成] 清理了 ${fileCacheCount} 个文件缓存`,
            );
        }
    }

    private isLargeFile(fileSize: number, config: any): boolean {
        // 检查文件是否为大文件
        const threshold = config.largeFileThreshold || 0; // 获取大文件阈值
        if (threshold <= 0) return false; // 阈值为 0 表示关闭大文件识别

        const base = config.fileSizeBase || 1000; // 使用用户设定的单位（MB 或 MiB）
        const thresholdBytes = threshold * base * base; // 转换为字节
        return fileSize >= thresholdBytes; // 判断文件大小是否超过阈值
    }


    public refreshAll(): void {
        // 刷新所有文件装饰，触发 VS Code 重新获取所有文件的装饰信息
        if (ConfigManager.isDebugMode()) {
            log.info(
                `[全量刷新] 通知 VS Code 重新获取所有文件装饰，基于缓存的 mtime 检查确保高效执行`,
            );
        }
        this._onDidChangeFileDecorations.fire(undefined); // 触发所有文件装饰的刷新，undefined 参数表示刷新所有文件，而不是特定文件
    }

    public refreshSpecific(uri: vscode.Uri): void {
        // 精准刷新单个文件或文件夹，纯粹的谁变化刷新谁
        // 清除变化文件的缓存
        this._fileCache.delete(uri.fsPath);

        if (ConfigManager.isDebugMode()) {
            log.info(`[精准刷新] 刷新单个项目: ${uri.fsPath}`);
        }

        // 只刷新变化的文件或文件夹，最简洁的策略
        this._onDidChangeFileDecorations.fire(uri);
    }
}
