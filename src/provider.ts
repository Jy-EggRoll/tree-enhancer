/**
 * 文件装饰提供者模块
 * 负责为资源管理器中的文件和文件夹提供悬浮提示信息
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { DirectoryInfo } from './types';
import { ConfigManager } from './config';
import { FileUtils } from './fileUtils';
import { Formatters } from './formatters';
import { DirectoryCalculator } from './calculator';

/**
 * 文件装饰提供者类
 * 负责为资源管理器中的文件和文件夹提供悬浮提示信息
 * 
 * 设计原则：
 * 1. 不使用缓存机制，确保信息实时性
 * 2. 每次悬浮都重新计算，保证准确性
 * 3. 异步计算避免阻塞界面
 * 4. 超时控制防止长时间等待
 */
export class FileDecorationProvider implements vscode.FileDecorationProvider {
    // 文件装饰变化事件发射器
    // 当文件装饰需要更新时，触发此事件通知 VS Code 重新获取装饰信息
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    // 正在计算中的目录集合，避免对同一目录重复启动计算
    // 使用文件路径作为键，确保每个目录同时只有一个计算任务
    private _calculatingDirs = new Set<string>();

    // 存储取消控制器映射表，用于超时取消计算
    // 键为文件路径，值为对应的 AbortController 实例
    private _abortControllers = new Map<string, AbortController>();

    // 临时存储最近一次计算完成的结果，仅在当前悬浮会话中有效
    // 这不是缓存！每次用户重新悬浮时都会清除并重新计算
    // 目的是在计算完成到界面刷新的短暂时间内能够显示结果
    private _temporaryResults = new Map<string, DirectoryInfo>();

    /**
     * 提供文件装饰信息的核心方法
     * 
     * 此方法在用户悬浮鼠标到资源管理器中的文件或文件夹时被调用
     * 
     * @param uri 文件或文件夹的URI，包含完整路径信息
     * @returns 文件装饰对象，包含工具提示等信息；如果出错则返回 undefined
     * 
     * 工作流程：
     * 1. 获取文件/文件夹的基本统计信息（大小、修改时间等）
     * 2. 对于普通文件：直接显示大小和修改时间
     * 3. 对于文件夹：检查是否正在计算，如果没有则启动新的计算任务
     * 4. 计算过程中显示"正在计算..."，完成后刷新显示实际结果
     */
    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
        try {
            // 严格过滤不相关的路径
            if (!FileUtils.shouldProcessPath(uri.fsPath)) {
                return undefined;
            }

            // 获取文件或文件夹的基本统计信息
            const stats = await FileUtils.getFileStats(uri.fsPath);
            if (!stats) {
                return undefined; // 无法获取文件信息
            }

            const fileName = FileUtils.getFileName(uri.fsPath);
            const config = ConfigManager.getConfig();

            let tooltip: string;

            if (stats.isDirectory()) {
                // 处理文件夹情况
                tooltip = await this.handleDirectoryDecoration(uri, fileName, stats, config);
            } else {
                // 处理普通文件情况
                tooltip = await this.handleFileDecoration(fileName, stats, config, uri.fsPath);
            }

            return { tooltip };
        } catch (error) {
            // 文件访问出错的处理
            FileUtils.logFileError(error, uri.fsPath);
            return undefined;
        }
    }

    /**
     * 处理文件的装饰信息
     * 
     * @param fileName 文件名
     * @param stats 文件统计信息
     * @param config 扩展配置
     * @param filePath 文件完整路径
     * @returns 格式化后的工具提示文本
     */
    private async handleFileDecoration(fileName: string, stats: fs.Stats, config: any, filePath: string): Promise<string> {
        // 检查是否为支持的图片格式
        if (FileUtils.isSupportedImage(fileName)) {
            // 尝试获取图片分辨率信息
            const imageDimensions = await FileUtils.getImageDimensions(filePath);
            const variables = Formatters.createFileVariables(fileName, stats.size, stats.mtime, imageDimensions || undefined);
            // 使用专门的图片文件模板
            const imageTemplate = config.imageFileTemplate || config.fileTemplate;
            return Formatters.renderTemplate(imageTemplate, variables);
        } else {
            // 普通文件处理
            const variables = Formatters.createFileVariables(fileName, stats.size, stats.mtime);
            return Formatters.renderTemplate(config.fileTemplate, variables);
        }
    }

    /**
     * 处理文件夹的装饰信息
     * 
     * @param uri 文件夹URI
     * @param fileName 文件夹名
     * @param stats 文件夹统计信息
     * @param config 扩展配置
     * @returns Promise<string> 格式化后的工具提示文本
     */
    private async handleDirectoryDecoration(
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any
    ): Promise<string> {
        const cacheKey = uri.fsPath;

        // 首先检查是否有临时计算结果
        const tempResult = this._temporaryResults.get(cacheKey);
        if (tempResult) {
            // 有临时结果，显示完整信息
            const variables = tempResult.isTimeout
                ? Formatters.createTimeoutVariables(fileName, stats.mtime, config.maxCalculationTime)
                : Formatters.createFolderVariables(fileName, tempResult.size, tempResult.fileCount, tempResult.folderCount, stats.mtime);

            const template = tempResult.isTimeout ? config.folderTimeoutTemplate : config.folderTemplate;

            // 清除临时结果，确保下次悬浮时重新计算
            this._temporaryResults.delete(cacheKey);

            return Formatters.renderTemplate(template, variables);
        }

        if (this._calculatingDirs.has(cacheKey)) {
            // 如果当前文件夹正在计算中，显示计算状态
            const variables = Formatters.createCalculatingVariables(fileName, stats.mtime);
            return Formatters.renderTemplate(config.folderCalculatingTemplate, variables);
        }

        // 文件夹当前没有在计算中，也没有临时结果，启动新的计算任务
        return await this.startDirectoryCalculation(uri, fileName, stats, config);
    }

    /**
     * 启动文件夹计算任务
     * 
     * @param uri 文件夹URI
     * @param fileName 文件夹名
     * @param stats 文件夹统计信息
     * @param config 扩展配置
     * @returns Promise<string> 初始状态的工具提示文本
     */
    private async startDirectoryCalculation(
        uri: vscode.Uri,
        fileName: string,
        stats: fs.Stats,
        config: any
    ): Promise<string> {
        const cacheKey = uri.fsPath;

        // 标记为计算中并启动详细计算
        this._calculatingDirs.add(cacheKey);

        try {
            // 尝试快速获取文件夹的直接子项数量（不递归）
            const directChildren = await DirectoryCalculator.getDirectChildrenCount(uri.fsPath);

            // 创建包含估算信息的变量对象
            const estimateInfo = `计算中（预估 ${directChildren.fileCount}+ 文件，${directChildren.folderCount}+ 文件夹）`;
            const variables = {
                ...Formatters.createCalculatingVariables(fileName, stats.mtime),
                estimate: estimateInfo
            };

            // 如果模板支持估算信息占位符，使用它；否则使用基本模板
            let displayTemplate = config.folderCalculatingTemplate;
            if (displayTemplate.includes('{estimate}')) {
                displayTemplate = displayTemplate.replace(/{estimate}/g, estimateInfo);
            }

        } catch (quickError) {
            // 如果连快速读取都失败，使用基本的计算中模板
        }

        // 异步启动完整的递归计算任务
        this.calculateAndUpdateDirectoryInfo(uri)
            .then(() => {
                // 计算成功完成，触发界面刷新
                this._onDidChangeFileDecorations.fire(uri);
            })
            .catch((error) => {
                // 计算出错或超时，清理状态并刷新界面
                this.handleCalculationError(error, cacheKey);
                this._onDidChangeFileDecorations.fire(uri);
            });

        // 返回当前计算中状态
        const variables = Formatters.createCalculatingVariables(fileName, stats.mtime);
        return Formatters.renderTemplate(config.folderCalculatingTemplate, variables);
    }

    /**
     * 计算并更新文件夹信息的私有方法
     * 
     * @param uri 文件夹的URI
     * @returns Promise<void> 无返回值，但会更新内部状态并触发界面刷新
     */
    private async calculateAndUpdateDirectoryInfo(uri: vscode.Uri): Promise<void> {
        const cacheKey = uri.fsPath;

        try {
            // 使用计算器进行带超时的计算
            const result = await DirectoryCalculator.calculateWithTimeout(uri.fsPath);

            // 存储临时结果，供下一次 provideFileDecoration 调用时使用
            this._temporaryResults.set(cacheKey, result);

            // 标记该文件夹计算已完成
            this._calculatingDirs.delete(cacheKey);
            this._abortControllers.delete(cacheKey);

        } catch (error) {
            // 处理计算过程中的各种错误情况
            if ((error as Error).message === 'Calculation aborted') {
                // 这是超时取消的情况
                this._temporaryResults.set(cacheKey, {
                    size: 0,
                    fileCount: 0,
                    folderCount: 0,
                    isTimeout: true
                });
            } else {
                // 其他类型的错误
                if (ConfigManager.isDebugMode()) {
                    console.error(`计算文件夹信息时发生错误: ${uri.fsPath}`, error);
                }
            }

            // 清理计算状态
            this._calculatingDirs.delete(cacheKey);
            this._abortControllers.delete(cacheKey);

            // 重新抛出错误，让调用方知道计算失败
            throw error;
        }
    }

    /**
     * 处理计算错误
     * 
     * @param error 错误对象
     * @param cacheKey 缓存键
     */
    private handleCalculationError(error: any, cacheKey: string): void {
        if ((error as Error).message !== 'Calculation aborted' && ConfigManager.isDebugMode()) {
            console.error('计算文件夹信息时出错:', error);
        }

        // 清理状态
        this._calculatingDirs.delete(cacheKey);
        this._abortControllers.delete(cacheKey);
    }

    /**
     * 清除所有内部状态
     * 
     * 当配置发生变更时调用，清除所有缓存和计算状态
     * 确保下次访问时使用新的配置重新计算
     */
    public clearAllStates(): void {
        // 清除所有正在计算的标记
        this._calculatingDirs.clear();

        // 取消所有正在进行的计算任务
        for (const [path, controller] of this._abortControllers) {
            controller.abort();
        }
        this._abortControllers.clear();

        // 清除所有临时结果
        this._temporaryResults.clear();
    }

    /**
     * 刷新所有文件装饰
     * 
     * 触发 VS Code 重新获取所有文件的装饰信息
     * 这会导致 provideFileDecoration 方法被重新调用
     */
    public refreshAll(): void {
        // 触发所有文件装饰的刷新
        // undefined 参数表示刷新所有文件，而不是特定文件
        this._onDidChangeFileDecorations.fire(undefined);
    }
}
