import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DirectoryInfo } from "./types";
import { ConfigManager } from "./config";
import { FileUtils } from "./fileUtils";
import { Formatters } from "./formatters";
import { DirectoryCalculator } from "./calculator";

interface FolderCacheEntry {
    // 文件夹缓存条目
    result: DirectoryInfo; // 计算结果
    timestamp: number; // 缓存时间戳
    mtime: number; // 文件夹修改时间
}

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
    private _calculatingDirs = new Set<string>(); // 正在计算中的目录集合，避免对同一目录重复启动计算，使用文件路径作为键
    private _abortControllers = new Map<string, AbortController>(); // 存储取消控制器映射表，用于超时取消计算，键为文件路径，值为对应的 AbortController 实例
    private _folderCache = new Map<string, FolderCacheEntry>(); // 文件夹计算结果缓存，避免重复计算和死循环
    private _fileCache = new Map<string, FileCacheEntry>(); // 文件信息缓存，避免重复读取文件大小和图片尺寸
    private _fileSystemWatcher?: vscode.FileSystemWatcher; // 文件系统监视器，监听文件变化

    async provideFileDecoration(
        uri: vscode.Uri,
    ): Promise<vscode.FileDecoration | undefined> {
        // 提供文件装饰信息的核心方法，VS Code 自动调用以获取文件装饰
        if (ConfigManager.isDebugMode()) {
            console.log(`[装饰请求] VS Code 请求文件装饰: ${uri.fsPath}`);
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
            const fileType = stats.isDirectory() ? "文件夹" : "文件"; // 确定文件类型
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `[装饰流程] 处理${fileType}: ${fileName}, mtime: ${stats.mtime.toISOString()}`,
                );
            }
            let tooltip: string;
            if (stats.isDirectory()) {
                // 处理文件夹情况
                tooltip = await this.handleDirectoryDecoration(
                    uri,
                    fileName,
                    stats,
                    config,
                );
            } else {
                // 处理普通文件情况
                tooltip = await this.handleFileDecoration(
                    fileName,
                    stats,
                    config,
                    uri.fsPath,
                );
            }
            if (ConfigManager.isDebugMode()) {
                console.log(`[装饰完成] ${fileName} 装饰生成完毕`);
            }

            // 检查是否需要添加大文件标识
            const decoration: vscode.FileDecoration = { tooltip };
            if (!stats.isDirectory() && this.isLargeFile(stats.size, config)) {
                // 只为文件添加大文件标识，文件夹不需要
                decoration.badge = "L"; // 使用 L 标识大文件
                decoration.color = new vscode.ThemeColor("charts.orange"); // 使用 VS Code 内置橙色
                if (ConfigManager.isDebugMode()) {
                    console.log(
                        `[大文件标识] 为大文件 ${fileName} 添加 L 标识`,
                    );
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
        stats: fs.Stats,
        config: any,
        filePath: string,
    ): Promise<string> {
        // 处理文件的装饰信息
        if (ConfigManager.isDebugMode()) {
            console.log(
                `[文件处理] 开始处理文件: ${fileName}, 大小: ${stats.size} 字节`,
            );
        } // 调试：记录开始处理文件

        // 检查文件缓存，mtime 预检查避免无意义的重复计算
        const cacheKey = filePath;
        const cached = this._fileCache.get(cacheKey);
        if (cached && cached.mtime === stats.mtime.getTime()) {
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `[文件缓存命中] 文件 ${fileName} mtime 未变，使用缓存`,
                );
            } // 调试：记录缓存命中
            const variables = Formatters.createFileVariables(
                fileName,
                cached.size,
                stats.mtime,
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
                console.log(`[图片文件] 检测到支持的图片格式: ${fileName}`);
            } // 调试：记录图片文件检测
            const imageDimensions =
                await FileUtils.getImageDimensions(filePath); // 尝试获取图片分辨率信息
            if (ConfigManager.isDebugMode() && imageDimensions) {
                console.log(
                    `[图片尺寸] ${fileName} 分辨率: ${imageDimensions.width}x${imageDimensions.height}`,
                );
            } // 调试：记录图片尺寸

            // 缓存图片文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                imageDimensions: imageDimensions || undefined,
                mtime: stats.mtime.getTime(),
            });

            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                stats.mtime,
                imageDimensions || undefined,
            );
            const imageTemplate =
                config.imageFileTemplate || config.fileTemplate; // 使用专门的图片文件模板
            return Formatters.renderTemplate(imageTemplate, variables);
        } else {
            // 普通文件处理
            if (ConfigManager.isDebugMode()) {
                console.log(`[普通文件] 处理普通文件: ${fileName}`);
            } // 调试：记录普通文件处理

            // 缓存普通文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                mtime: stats.mtime.getTime(),
            });

            const variables = Formatters.createFileVariables(
                fileName,
                stats.size,
                stats.mtime,
            );
            return Formatters.renderTemplate(config.fileTemplate, variables);
        }
    }

    private async handleDirectoryDecoration(
        // 处理文件夹的装饰信息
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any,
    ): Promise<string> {
        const cacheKey = uri.fsPath;
        if (ConfigManager.isDebugMode()) {
            console.log(`[文件夹处理] 开始处理文件夹: ${fileName}`);
        } // 调试：记录开始处理文件夹

        // 检查缓存，优先进行 mtime 预检查避免无意义的计算
        const cached = this._folderCache.get(cacheKey);
        if (cached) {
            // mtime 预检查：如果修改时间没变，直接使用缓存，避免无意义重计算
            if (cached.mtime === stats.mtime.getTime()) {
                if (ConfigManager.isDebugMode()) {
                    console.log(
                        `[文件夹缓存命中] 文件夹 ${fileName} 修改时间未变，直接使用缓存`,
                    );
                } // 调试：记录 mtime 未变
                const variables = cached.result.isTimeout
                    ? Formatters.createTimeoutVariables(
                          fileName,
                          stats.mtime,
                          config.maxCalculationTime,
                      )
                    : Formatters.createFolderVariables(
                          fileName,
                          cached.result.size,
                          cached.result.fileCount,
                          cached.result.folderCount,
                          stats.mtime,
                      );
                const template = cached.result.isTimeout
                    ? config.folderTimeoutTemplate
                    : config.folderTemplate;
                return Formatters.renderTemplate(template, variables);
            } else {
                if (ConfigManager.isDebugMode()) {
                    console.log(
                        `[文件夹变化] 文件夹 ${fileName} 修改时间变化，缓存失效`,
                    );
                } // 调试：记录 mtime 变化
            }
        }

        if (this._calculatingDirs.has(cacheKey)) {
            // 如果当前文件夹正在计算中，显示计算状态
            if (ConfigManager.isDebugMode()) {
                console.log(`[计算状态] 文件夹 ${fileName} 正在计算中...`);
            } // 调试：记录正在计算的状态
            const variables = Formatters.createCalculatingVariables(
                fileName,
                stats.mtime,
            );
            return Formatters.renderTemplate(
                config.folderCalculatingTemplate,
                variables,
            );
        }

        if (ConfigManager.isDebugMode()) {
            console.log(`[启动计算] 文件夹 ${fileName} 需要开始新的计算任务`);
        } // 调试：记录需要启动新计算
        return await this.startDirectoryCalculation(
            uri,
            fileName,
            stats,
            config,
        ); // 启动新的计算任务
    }

    private async startDirectoryCalculation(
        // 启动文件夹计算任务
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any,
    ): Promise<string> {
        const cacheKey = uri.fsPath;
        this._calculatingDirs.add(cacheKey); // 标记为计算中并启动详细计算
        if (ConfigManager.isDebugMode()) {
            console.log(
                `[计算开始] 文件夹 ${fileName} 已标记为计算中，开始异步计算`,
            );
        } // 调试：记录计算开始

        this.calculateAndUpdateDirectoryInfo(uri) // 异步启动完整的递归计算任务
            .then(() => {
                if (ConfigManager.isDebugMode()) {
                    console.log(
                        `[计算完成] 文件夹 ${fileName} 计算成功，触发界面刷新`,
                    );
                } // 调试：记录计算完成
                this._onDidChangeFileDecorations.fire(uri); // 计算成功完成，触发界面刷新
            })
            .catch((error) => {
                if (ConfigManager.isDebugMode()) {
                    console.warn(
                        `[计算失败] 文件夹 ${fileName} 计算失败:`,
                        error,
                    );
                } // 调试：记录计算失败
                this.handleCalculationError(error, cacheKey); // 计算出错或超时，清理状态并刷新界面
                this._onDidChangeFileDecorations.fire(uri);
            });
        const variables = Formatters.createCalculatingVariables(
            fileName,
            stats.mtime,
        ); // 返回当前计算中状态
        return Formatters.renderTemplate(
            config.folderCalculatingTemplate,
            variables,
        );
    }

    private async calculateAndUpdateDirectoryInfo(
        uri: vscode.Uri,
    ): Promise<void> {
        // 计算并更新文件夹信息的私有方法
        const cacheKey = uri.fsPath;
        const fileName = FileUtils.getFileName(uri.fsPath);
        const stats = await FileUtils.getFileStats(uri.fsPath); // 获取文件夹统计信息用于缓存
        if (!stats) return; // 无法获取统计信息，退出

        if (ConfigManager.isDebugMode()) {
            console.log(`[深度计算] 开始计算文件夹 ${fileName} 的详细信息`);
        } // 调试：记录深度计算开始
        try {
            const result = await DirectoryCalculator.calculateWithTimeout(
                uri.fsPath,
            ); // 使用计算器进行带超时的计算
            if (ConfigManager.isDebugMode()) {
                console.log(`[深度计算成功] 文件夹 ${fileName} 结果:`, result);
            } // 调试：记录深度计算成功

            // 存储到缓存
            this._folderCache.set(cacheKey, {
                result,
                timestamp: Date.now(),
                mtime: stats.mtime.getTime(),
            });

            this._calculatingDirs.delete(cacheKey); // 标记该文件夹计算已完成
            this._abortControllers.delete(cacheKey);
        } catch (error) {
            // 处理计算过程中的各种错误情况
            if ((error as Error).message === "Calculation aborted") {
                // 这是超时取消的情况
                if (ConfigManager.isDebugMode()) {
                    console.warn(`[计算超时] 文件夹 ${fileName} 计算超时`);
                } // 调试：记录计算超时

                // 超时也要缓存，避免重复尝试
                this._folderCache.set(cacheKey, {
                    result: {
                        size: 0,
                        fileCount: 0,
                        folderCount: 0,
                        isTimeout: true,
                    },
                    timestamp: Date.now(),
                    mtime: stats.mtime.getTime(),
                });
            } else {
                // 其他类型的错误
                if (ConfigManager.isDebugMode()) {
                    console.error(
                        `[深度计算错误] 计算文件夹 ${fileName} 信息时发生错误: ${uri.fsPath}`,
                        error,
                    );
                }
            }
            this._calculatingDirs.delete(cacheKey); // 清理计算状态
            this._abortControllers.delete(cacheKey);
            throw error; // 重新抛出错误，让调用方知道计算失败
        }
    }

    private handleCalculationError(error: any, cacheKey: string): void {
        // 处理计算错误
        if (
            (error as Error).message !== "Calculation aborted" &&
            ConfigManager.isDebugMode()
        ) {
            console.error("计算文件夹信息时出错:", error);
        }
        this._calculatingDirs.delete(cacheKey); // 清理状态
        this._abortControllers.delete(cacheKey);
    }

    public clearAllStates(): void {
        // 清除所有内部状态，当配置发生变更时调用，清除所有缓存和计算状态
        if (ConfigManager.isDebugMode()) {
            console.log(`[状态清理] 开始清理所有内部状态`);
        } // 调试：记录状态清理开始
        const calculatingCount = this._calculatingDirs.size;
        const abortCount = this._abortControllers.size;
        const folderCacheCount = this._folderCache.size;
        const fileCacheCount = this._fileCache.size;

        this._calculatingDirs.clear(); // 清除所有正在计算的标记
        for (const [path, controller] of this._abortControllers) {
            // 取消所有正在进行的计算任务
            controller.abort();
        }
        this._abortControllers.clear();
        this._folderCache.clear(); // 清除所有文件夹缓存
        this._fileCache.clear(); // 清除所有文件缓存
        this.stopFileSystemWatcher(); // 停止文件系统监视器

        if (ConfigManager.isDebugMode()) {
            // 调试：记录清理统计
            console.log(
                `[状态清理完成] 清理了 ${calculatingCount} 个计算中的文件夹, ${abortCount} 个取消控制器, ${folderCacheCount} 个文件夹缓存, ${fileCacheCount} 个文件缓存`,
            );
        }
    }

    private isCacheValid(
        cached: FolderCacheEntry,
        currentStats: fs.Stats,
    ): boolean {
        // 检查缓存是否有效
        // 只检查文件夹修改时间，没变化就永远有效，避免无意义的重复计算
        if (cached.mtime !== currentStats.mtime.getTime()) {
            return false;
        }

        return true;
    }

    private isLargeFile(fileSize: number, config: any): boolean {
        // 检查文件是否为大文件
        const threshold = config.largeFileThreshold || 0; // 获取大文件阈值
        if (threshold <= 0) return false; // 阈值为 0 表示关闭大文件识别

        const base = config.fileSizeBase || 1000; // 使用用户设定的单位（MB 或 MiB）
        const thresholdBytes = threshold * base * base; // 转换为字节
        return fileSize >= thresholdBytes; // 判断文件大小是否超过阈值
    }

    private cleanupStaleCalculations(): void {
        // 清理过时的计算状态，不影响缓存和装饰显示
        // 只清理长时间卡住的计算状态，不影响正常的缓存和装饰
        // 这避免了全量刷新导致的闪烁问题
        if (ConfigManager.isDebugMode()) {
            console.log(`[智能清理] 检查过时的计算状态`);
        } // 调试：记录智能清理

        // 这里可以添加清理长时间未完成计算的逻辑，但通常不需要
        // 因为我们已经有超时机制，大部分情况下不会有卡住的计算
    }

    public refreshAll(): void {
        // 刷新所有文件装饰，触发 VS Code 重新获取所有文件的装饰信息
        if (ConfigManager.isDebugMode()) {
            console.log(
                `[全量刷新] 通知 VS Code 重新获取所有文件装饰，基于缓存的 mtime 检查确保高效执行`,
            );
        }
        this._onDidChangeFileDecorations.fire(undefined); // 触发所有文件装饰的刷新，undefined 参数表示刷新所有文件，而不是特定文件
    }

    public refreshSpecific(uri: vscode.Uri): void {
        // 精准刷新单个文件或文件夹，纯粹的谁变化刷新谁
        // 清除变化文件的缓存
        this._fileCache.delete(uri.fsPath);
        this._folderCache.delete(uri.fsPath);

        if (ConfigManager.isDebugMode()) {
            console.log(`[精准刷新] 刷新单个项目: ${uri.fsPath}`);
        }

        // 只刷新变化的文件或文件夹，最简洁的策略
        this._onDidChangeFileDecorations.fire(uri);
    }

    public startFileSystemWatcher(): void {
        // 启动文件系统监视器，监听工作空间中的文件变化
        if (this._fileSystemWatcher) {
            return; // 已经启动，避免重复启动
        }

        if (
            !vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0
        ) {
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `[文件监视器] 没有工作空间文件夹，跳过启动文件监视器`,
                );
            }
            return;
        }

        if (ConfigManager.isDebugMode()) {
            console.log(`[文件监视器] 正在启动文件系统监视器...`);
        }

        // 监听工作空间文件夹中的文件变化，排除不必要的目录
        this._fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
            "**/*",
            false, // 不忽略创建事件
            false, // 不忽略修改事件
            false, // 不忽略删除事件
        );

        // 监听文件和文件夹变化事件
        this._fileSystemWatcher.onDidChange((uri) => {
            if (this.shouldIgnoreFile(uri)) return; // 过滤不需要监视的文件/文件夹
            if (ConfigManager.isDebugMode()) {
                this.logFileSystemEvent("变化", uri);
            }
            this.handleFileChange(uri);
        });

        // 监听文件和文件夹创建事件
        this._fileSystemWatcher.onDidCreate((uri) => {
            if (this.shouldIgnoreFile(uri)) return; // 过滤不需要监视的文件/文件夹
            if (ConfigManager.isDebugMode()) {
                this.logFileSystemEvent("创建", uri);
            }
            this.handleFileChange(uri);
        });

        // 监听文件和文件夹删除事件
        this._fileSystemWatcher.onDidDelete((uri) => {
            if (this.shouldIgnoreFile(uri)) return; // 过滤不需要监视的文件/文件夹
            if (ConfigManager.isDebugMode()) {
                this.logFileSystemEvent("删除", uri);
            }
            this.handleFileDelete(uri);
        });

        if (ConfigManager.isDebugMode()) {
            console.log(`[文件监视器] 文件系统监视器启动完成`);
        }
    }

    public stopFileSystemWatcher(): void {
        // 停止文件系统监视器
        if (this._fileSystemWatcher) {
            if (ConfigManager.isDebugMode()) {
                console.log(`[文件监视器] 正在停止文件系统监视器...`);
            }
            this._fileSystemWatcher.dispose();
            this._fileSystemWatcher = undefined;
        }
    }

    private shouldIgnoreFile(uri: vscode.Uri): boolean {
        // 检查是否应忽略此文件或目录
        const filePath = uri.fsPath;
        const ignoredPaths = [".git", "node_modules"]; // 需要在监视器中忽略的路径

        for (const ignoredPath of ignoredPaths) {
            if (
                filePath.includes(path.sep + ignoredPath + path.sep) ||
                filePath.endsWith(path.sep + ignoredPath)
            ) {
                if (ConfigManager.isDebugMode()) {
                    console.log(
                        `[文件监视器] 忽略变化: ${filePath} (匹配忽略规则: ${ignoredPath})`,
                    );
                }
                return true;
            }
        }
        return false;
    }

    private logFileSystemEvent(eventType: string, uri: vscode.Uri): void {
        // 简洁的文件系统事件日志
        console.log(`[文件监视器] 检测到${eventType}: ${uri.fsPath}`);
    }

    private handleFileChange(uri: vscode.Uri): void {
        // 处理文件或文件夹变化事件
        if (ConfigManager.isDebugMode()) {
            console.log(`[刷新触发] 精准刷新: ${uri.fsPath}`);
        }
        this.refreshSpecific(uri); // 纯粹的谁变化刷新谁
    }

    private handleFileDelete(uri: vscode.Uri): void {
        // 处理文件或文件夹删除事件
        const filePath = uri.fsPath;

        // 清除被删除项目的缓存和计算状态
        this._fileCache.delete(filePath);
        this._folderCache.delete(filePath);

        if (this._calculatingDirs.has(filePath)) {
            // 取消可能正在进行的计算
            const controller = this._abortControllers.get(filePath);
            if (controller) {
                controller.abort();
                this._abortControllers.delete(filePath);
            }
            this._calculatingDirs.delete(filePath);
        }

        if (ConfigManager.isDebugMode()) {
            console.log(`[删除处理] → 清理缓存: ${filePath}`);
        }
        // 删除事件不需要刷新，依赖 VS Code 原生机制
    }
}
