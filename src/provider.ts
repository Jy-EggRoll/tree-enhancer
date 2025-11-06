import * as vscode from 'vscode';
import * as fs from 'fs';
import { DirectoryInfo } from './types';
import { ConfigManager } from './config';
import { FileUtils } from './fileUtils';
import { Formatters } from './formatters';
import { DirectoryCalculator } from './calculator';

interface FolderCacheEntry { // 文件夹缓存条目
    result: DirectoryInfo; // 计算结果
    timestamp: number; // 缓存时间戳
    mtime: number; // 文件夹修改时间
}

interface FileCacheEntry { // 文件缓存条目
    size: number; // 文件大小
    imageDimensions?: { width: number; height: number }; // 图片尺寸（如果是图片）
    mtime: number; // 文件修改时间
}

export class FileDecorationProvider implements vscode.FileDecorationProvider { // 文件装饰提供者类，负责为资源管理器中的文件和文件夹提供装饰信息
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>(); // 文件装饰变化事件发射器，当文件装饰需要更新时，触发此事件通知VS Code重新获取装饰信息
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private _calculatingDirs = new Set<string>(); // 正在计算中的目录集合，避免对同一目录重复启动计算，使用文件路径作为键
    private _abortControllers = new Map<string, AbortController>(); // 存储取消控制器映射表，用于超时取消计算，键为文件路径，值为对应的AbortController实例
    private _folderCache = new Map<string, FolderCacheEntry>(); // 文件夹计算结果缓存，避免重复计算和死循环
    private _fileCache = new Map<string, FileCacheEntry>(); // 文件信息缓存，避免重复读取文件大小和图片尺寸

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> { // 提供文件装饰信息的核心方法，VS Code 自动调用以获取文件装饰
        if (ConfigManager.isDebugMode()) { console.log(`[装饰请求] 请求装饰: ${uri.fsPath}`); } // 调试：记录装饰请求
        try {
            if (!FileUtils.shouldProcessPath(uri.fsPath)) { // 严格过滤不相关的路径
                if (ConfigManager.isDebugMode()) { console.log(`[路径过滤] 跳过路径: ${uri.fsPath}`); } // 调试：记录被过滤的路径
                return undefined;
            }
            const stats = await FileUtils.getFileStats(uri.fsPath); // 获取文件或文件夹的基本统计信息
            if (!stats) {
                if (ConfigManager.isDebugMode()) { console.warn(`[文件访问] 无法获取文件信息: ${uri.fsPath}`); } // 调试：记录无法访问的文件
                return undefined; // 无法获取文件信息
            }
            const fileName = FileUtils.getFileName(uri.fsPath);
            const config = ConfigManager.getConfig();
            const fileType = stats.isDirectory() ? '文件夹' : '文件'; // 确定文件类型
            if (ConfigManager.isDebugMode()) { console.log(`[文件类型] ${fileType}: ${fileName} (路径: ${uri.fsPath})`); } // 调试：记录文件类型和基本信息
            let tooltip: string;
            if (stats.isDirectory()) { // 处理文件夹情况
                tooltip = await this.handleDirectoryDecoration(uri, fileName, stats, config);
            } else { // 处理普通文件情况
                tooltip = await this.handleFileDecoration(fileName, stats, config, uri.fsPath);
            }
            if (ConfigManager.isDebugMode()) { console.log(`[返回结果] 为 ${fileName} 生成的工具提示: ${tooltip.substring(0, 100)}${tooltip.length > 100 ? '...' : ''}`); } // 调试：记录返回的工具提示（截断显示）
            return { tooltip };
        } catch (error) { // 文件访问出错的处理
            if (ConfigManager.isDebugMode()) { console.error(`[提供装饰异常] 处理 ${uri.fsPath} 时发生错误:`, error); } // 调试：记录装饰提供过程中的异常
            FileUtils.logFileError(error, uri.fsPath);
            return undefined;
        }
    }

    private async handleFileDecoration(fileName: string, stats: fs.Stats, config: any, filePath: string): Promise<string> { // 处理文件的装饰信息
        if (ConfigManager.isDebugMode()) { console.log(`[文件处理] 开始处理文件: ${fileName}, 大小: ${stats.size} 字节`); } // 调试：记录开始处理文件
        
        // 检查文件缓存，mtime预检查避免无意义的重复计算
        const cacheKey = filePath;
        const cached = this._fileCache.get(cacheKey);
        if (cached && cached.mtime === stats.mtime.getTime()) {
            if (ConfigManager.isDebugMode()) { console.log(`[文件缓存命中] 文件 ${fileName} mtime未变，使用缓存`); } // 调试：记录缓存命中
            const variables = Formatters.createFileVariables(fileName, cached.size, stats.mtime, cached.imageDimensions);
            const template = cached.imageDimensions ? (config.imageFileTemplate || config.fileTemplate) : config.fileTemplate;
            return Formatters.renderTemplate(template, variables);
        }
        
        if (FileUtils.isSupportedImage(fileName)) { // 检查是否为支持的图片格式
            if (ConfigManager.isDebugMode()) { console.log(`[图片文件] 检测到支持的图片格式: ${fileName}`); } // 调试：记录图片文件检测
            const imageDimensions = await FileUtils.getImageDimensions(filePath); // 尝试获取图片分辨率信息
            if (ConfigManager.isDebugMode() && imageDimensions) { console.log(`[图片尺寸] ${fileName} 分辨率: ${imageDimensions.width}x${imageDimensions.height}`); } // 调试：记录图片尺寸
            
            // 缓存图片文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                imageDimensions: imageDimensions || undefined,
                mtime: stats.mtime.getTime()
            });
            
            const variables = Formatters.createFileVariables(fileName, stats.size, stats.mtime, imageDimensions || undefined);
            const imageTemplate = config.imageFileTemplate || config.fileTemplate; // 使用专门的图片文件模板
            return Formatters.renderTemplate(imageTemplate, variables);
        } else { // 普通文件处理
            if (ConfigManager.isDebugMode()) { console.log(`[普通文件] 处理普通文件: ${fileName}`); } // 调试：记录普通文件处理
            
            // 缓存普通文件信息
            this._fileCache.set(cacheKey, {
                size: stats.size,
                mtime: stats.mtime.getTime()
            });
            
            const variables = Formatters.createFileVariables(fileName, stats.size, stats.mtime);
            return Formatters.renderTemplate(config.fileTemplate, variables);
        }
    }

    private async handleDirectoryDecoration( // 处理文件夹的装饰信息
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any
    ): Promise<string> {
        const cacheKey = uri.fsPath;
        if (ConfigManager.isDebugMode()) { console.log(`[文件夹处理] 开始处理文件夹: ${fileName}`); } // 调试：记录开始处理文件夹

        // 检查缓存，优先进行mtime预检查避免无意义的计算
        const cached = this._folderCache.get(cacheKey);
        if (cached) {
            // mtime预检查：如果修改时间没变，直接使用缓存，避免无意义重计算
            if (cached.mtime === stats.mtime.getTime()) {
                if (ConfigManager.isDebugMode()) { console.log(`[mtime未变] 文件夹 ${fileName} 修改时间未变，直接使用缓存`); } // 调试：记录mtime未变
                const variables = cached.result.isTimeout
                    ? Formatters.createTimeoutVariables(fileName, stats.mtime, config.maxCalculationTime)
                    : Formatters.createFolderVariables(fileName, cached.result.size, cached.result.fileCount, cached.result.folderCount, stats.mtime);
                const template = cached.result.isTimeout ? config.folderTimeoutTemplate : config.folderTemplate;
                return Formatters.renderTemplate(template, variables);
            } else {
                if (ConfigManager.isDebugMode()) { console.log(`[mtime变化] 文件夹 ${fileName} 修改时间变化，缓存失效`); } // 调试：记录mtime变化
            }
        }

        if (this._calculatingDirs.has(cacheKey)) { // 如果当前文件夹正在计算中，显示计算状态
            if (ConfigManager.isDebugMode()) { console.log(`[计算状态] 文件夹 ${fileName} 正在计算中...`); } // 调试：记录正在计算的状态
            const variables = Formatters.createCalculatingVariables(fileName, stats.mtime);
            return Formatters.renderTemplate(config.folderCalculatingTemplate, variables);
        }

        if (ConfigManager.isDebugMode()) { console.log(`[启动计算] 文件夹 ${fileName} 需要开始新的计算任务`); } // 调试：记录需要启动新计算
        return await this.startDirectoryCalculation(uri, fileName, stats, config); // 启动新的计算任务
    }

    private async startDirectoryCalculation( // 启动文件夹计算任务
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any
    ): Promise<string> {
        const cacheKey = uri.fsPath;
        this._calculatingDirs.add(cacheKey); // 标记为计算中并启动详细计算
        if (ConfigManager.isDebugMode()) { console.log(`[计算开始] 文件夹 ${fileName} 已标记为计算中，开始异步计算`); } // 调试：记录计算开始
        try {
            const directChildren = await DirectoryCalculator.getDirectChildrenCount(uri.fsPath); // 尝试快速获取文件夹的直接子项数量（不递归）
            const estimateInfo = `计算中（预估 ${directChildren.fileCount}+ 文件，${directChildren.folderCount}+ 文件夹）`; // 创建包含估算信息的变量对象
            const variables = {
                ...Formatters.createCalculatingVariables(fileName, stats.mtime),
                estimate: estimateInfo
            };
            let displayTemplate = config.folderCalculatingTemplate; // 如果模板支持估算信息占位符，使用它；否则使用基本模板
            if (displayTemplate.includes('{estimate}')) {
                displayTemplate = displayTemplate.replace(/{estimate}/g, estimateInfo);
            }
        } catch (quickError) { // 如果连快速读取都失败，使用基本的计算中模板
        }
        this.calculateAndUpdateDirectoryInfo(uri) // 异步启动完整的递归计算任务
            .then(() => {
                if (ConfigManager.isDebugMode()) { console.log(`[计算完成] 文件夹 ${fileName} 计算成功，触发界面刷新`); } // 调试：记录计算完成
                this._onDidChangeFileDecorations.fire(uri); // 计算成功完成，触发界面刷新
            })
            .catch((error) => {
                if (ConfigManager.isDebugMode()) { console.warn(`[计算失败] 文件夹 ${fileName} 计算失败:`, error); } // 调试：记录计算失败
                this.handleCalculationError(error, cacheKey); // 计算出错或超时，清理状态并刷新界面
                this._onDidChangeFileDecorations.fire(uri);
            });
        const variables = Formatters.createCalculatingVariables(fileName, stats.mtime); // 返回当前计算中状态
        return Formatters.renderTemplate(config.folderCalculatingTemplate, variables);
    }

    private async calculateAndUpdateDirectoryInfo(uri: vscode.Uri): Promise<void> { // 计算并更新文件夹信息的私有方法
        const cacheKey = uri.fsPath;
        const fileName = FileUtils.getFileName(uri.fsPath);
        const stats = await FileUtils.getFileStats(uri.fsPath); // 获取文件夹统计信息用于缓存
        if (!stats) return; // 无法获取统计信息，退出

        if (ConfigManager.isDebugMode()) { console.log(`[深度计算] 开始计算文件夹 ${fileName} 的详细信息`); } // 调试：记录深度计算开始
        try {
            const result = await DirectoryCalculator.calculateWithTimeout(uri.fsPath); // 使用计算器进行带超时的计算
            if (ConfigManager.isDebugMode()) { console.log(`[深度计算成功] 文件夹 ${fileName} 结果:`, result); } // 调试：记录深度计算成功

            // 存储到缓存
            this._folderCache.set(cacheKey, {
                result,
                timestamp: Date.now(),
                mtime: stats.mtime.getTime()
            });

            this._calculatingDirs.delete(cacheKey); // 标记该文件夹计算已完成
            this._abortControllers.delete(cacheKey);
        } catch (error) { // 处理计算过程中的各种错误情况
            if ((error as Error).message === 'Calculation aborted') { // 这是超时取消的情况
                if (ConfigManager.isDebugMode()) { console.warn(`[计算超时] 文件夹 ${fileName} 计算超时`); } // 调试：记录计算超时

                // 超时也要缓存，避免重复尝试
                this._folderCache.set(cacheKey, {
                    result: { size: 0, fileCount: 0, folderCount: 0, isTimeout: true },
                    timestamp: Date.now(),
                    mtime: stats.mtime.getTime()
                });
            } else { // 其他类型的错误
                if (ConfigManager.isDebugMode()) {
                    console.error(`[深度计算错误] 计算文件夹 ${fileName} 信息时发生错误: ${uri.fsPath}`, error);
                }
            }
            this._calculatingDirs.delete(cacheKey); // 清理计算状态
            this._abortControllers.delete(cacheKey);
            throw error; // 重新抛出错误，让调用方知道计算失败
        }
    }

    private handleCalculationError(error: any, cacheKey: string): void { // 处理计算错误
        if ((error as Error).message !== 'Calculation aborted' && ConfigManager.isDebugMode()) {
            console.error('计算文件夹信息时出错:', error);
        }
        this._calculatingDirs.delete(cacheKey); // 清理状态
        this._abortControllers.delete(cacheKey);
    }

    public clearAllStates(): void { // 清除所有内部状态，当配置发生变更时调用，清除所有缓存和计算状态
        if (ConfigManager.isDebugMode()) { console.log(`[状态清理] 开始清理所有内部状态`); } // 调试：记录状态清理开始
        const calculatingCount = this._calculatingDirs.size;
        const abortCount = this._abortControllers.size;
        const folderCacheCount = this._folderCache.size;
        const fileCacheCount = this._fileCache.size;

        this._calculatingDirs.clear(); // 清除所有正在计算的标记
        for (const [path, controller] of this._abortControllers) { // 取消所有正在进行的计算任务
            controller.abort();
        }
        this._abortControllers.clear();
        this._folderCache.clear(); // 清除所有文件夹缓存
        this._fileCache.clear(); // 清除所有文件缓存
        this.stopPeriodicRefresh(); // 停止定期刷新

        if (ConfigManager.isDebugMode()) { // 调试：记录清理统计
            console.log(`[状态清理完成] 清理了 ${calculatingCount} 个计算中的文件夹, ${abortCount} 个取消控制器, ${folderCacheCount} 个文件夹缓存, ${fileCacheCount} 个文件缓存`);
        }
    }

    private _refreshTimer: NodeJS.Timeout | undefined; // 定时刷新器，用于定期更新文件装饰

    public startPeriodicRefresh(): void { // 启动定期刷新机制
        const config = ConfigManager.getConfig();
        if (config.refreshInterval <= 0) { // 如果刷新间隔为0或负数，禁用自动刷新
            return;
        }

        if (this._refreshTimer) { // 如果已有定时器，先清除
            clearInterval(this._refreshTimer);
        }

        this._refreshTimer = setInterval(() => {
            if (ConfigManager.isDebugMode()) { console.log(`[定期刷新] 执行定期刷新，间隔: ${config.refreshInterval} 秒`); } // 调试：记录定期刷新
            this.refreshAll(); // 刷新所有文件装饰
        }, config.refreshInterval * 1000);

        if (ConfigManager.isDebugMode()) { console.log(`[定期刷新] 已启动定期刷新，间隔: ${config.refreshInterval} 秒`); } // 调试：记录定期刷新启动
    }

    public stopPeriodicRefresh(): void { // 停止定期刷新
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = undefined;
            if (ConfigManager.isDebugMode()) { console.log(`[定期刷新] 已停止定期刷新`); } // 调试：记录定期刷新停止
        }
    }

    private isCacheValid(cached: FolderCacheEntry, currentStats: fs.Stats): boolean { // 检查缓存是否有效
        // 只检查文件夹修改时间，没变化就永远有效，避免无意义的重复计算
        if (cached.mtime !== currentStats.mtime.getTime()) {
            return false;
        }

        return true;
    }



    public refreshAll(): void { // 刷新所有文件装饰，触发VS Code重新获取所有文件的装饰信息
        this._onDidChangeFileDecorations.fire(undefined); // 触发所有文件装饰的刷新，undefined参数表示刷新所有文件，而不是特定文件
    }
}
