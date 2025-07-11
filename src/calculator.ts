/**
 * 文件夹信息计算模块
 * 负责异步计算文件夹的大小、文件数量等信息
 */

import * as fs from 'fs';
import { DirectoryInfo } from './types';
import { FileUtils } from './fileUtils';
import { ConfigManager } from './config';

/**
 * 文件夹信息计算器
 * 提供递归计算文件夹详细信息的功能，支持取消操作
 */
export class DirectoryCalculator {
    /**
     * 计算文件夹大小和文件统计信息的异步函数
     * 
     * 递归遍历文件夹，统计所有子文件和子文件夹的信息
     * 支持通过 AbortSignal 取消长时间运行的计算
     * 
     * @param dirPath 文件夹路径
     * @param signal AbortSignal 用于取消计算
     * @returns Promise<DirectoryInfo> 返回大小、文件数、文件夹数
     */
    public static async calculateDirectoryInfo(
        dirPath: string,
        signal?: AbortSignal
    ): Promise<DirectoryInfo> {
        // 检查是否被取消
        if (signal?.aborted) {
            throw new Error('Calculation aborted');
        }

        try {
            let totalSize = 0;
            let fileCount = 0;
            let folderCount = 0;

            // 读取目录内容，包含文件类型信息
            const items = await FileUtils.getDirectoryEntries(dirPath);

            // 遍历目录中的每个项目
            for (const item of items) {
                // 再次检查是否被取消
                if (signal?.aborted) {
                    throw new Error('Calculation aborted');
                }

                const itemPath = FileUtils.joinPath(dirPath, item.name);
                try {
                    if (item.isDirectory()) {
                        // 如果是文件夹，递归计算并累加结果
                        folderCount++;
                        const subResult = await this.calculateDirectoryInfo(itemPath, signal);
                        totalSize += subResult.size;
                        fileCount += subResult.fileCount;
                        folderCount += subResult.folderCount;
                    } else if (item.isFile()) {
                        // 如果是文件，获取文件大小并累加
                        fileCount++;
                        const stats = await FileUtils.getFileStats(itemPath);
                        if (stats) {
                            totalSize += stats.size;
                        }
                    }
                } catch (error) {
                    // 忽略无法访问的文件/目录（如权限问题），但记录警告
                    // 注意：如果是计算被取消，不要记录为"无法访问"，因为这是正常的取消操作
                    if ((error as Error).message !== 'Calculation aborted') {
                        if (ConfigManager.isDebugMode()) {
                            console.warn(`无法访问: ${itemPath}`, error);
                        }
                    }
                    // 如果是计算被取消，直接重新抛出，让上层处理
                    if ((error as Error).message === 'Calculation aborted') {
                        throw error;
                    }
                }
            }

            return { size: totalSize, fileCount, folderCount };
        } catch (error) {
            // 如果是取消操作，重新抛出错误
            if (signal?.aborted || (error as Error).message === 'Calculation aborted') {
                throw error;
            }
            if (ConfigManager.isDebugMode()) {
                console.error(`计算目录信息失败: ${dirPath}`, error);
            }
            return { size: 0, fileCount: 0, folderCount: 0 };
        }
    }

    /**
     * 快速获取文件夹的直接子项数量（不递归）
     * 用于在详细计算过程中提供初步信息
     * 
     * @param dirPath 文件夹路径
     * @returns Promise<{fileCount: number, folderCount: number}> 直接子项统计
     */
    public static async getDirectChildrenCount(dirPath: string): Promise<{
        fileCount: number;
        folderCount: number;
    }> {
        try {
            const items = await FileUtils.getDirectoryEntries(dirPath);
            let fileCount = 0;
            let folderCount = 0;

            for (const item of items) {
                if (item.isFile()) {
                    fileCount++;
                } else if (item.isDirectory()) {
                    folderCount++;
                }
            }

            return { fileCount, folderCount };
        } catch (error) {
            if (ConfigManager.isDebugMode()) {
                console.warn(`无法读取目录: ${dirPath}`, error);
            }
            return { fileCount: 0, folderCount: 0 };
        }
    }

    /**
     * 创建带超时的计算任务
     * 封装计算逻辑，自动处理超时控制
     * 
     * @param dirPath 文件夹路径
     * @param timeoutMs 超时时间（毫秒）
     * @returns Promise<DirectoryInfo> 计算结果，超时时抛出错误
     */
    public static async calculateWithTimeout(
        dirPath: string,
        timeoutMs?: number
    ): Promise<DirectoryInfo> {
        const timeout = timeoutMs || ConfigManager.getMaxCalculationTime();

        // 创建取消控制器，用于实现超时功能
        const abortController = new AbortController();

        // 设置超时定时器
        const timeoutId = setTimeout(() => {
            if (ConfigManager.isDebugMode()) {
                console.log(`文件夹计算超时，已取消: ${dirPath} (${timeout}ms)`);
            }
            abortController.abort(); // 发送取消信号
        }, timeout);

        try {
            // 开始计算文件夹信息
            const result = await this.calculateDirectoryInfo(dirPath, abortController.signal);

            // 计算成功完成，清除超时定时器
            clearTimeout(timeoutId);

            if (ConfigManager.isDebugMode()) {
                console.log(`文件夹计算完成: ${dirPath}, 大小: ${result.size}, 文件: ${result.fileCount}, 文件夹: ${result.folderCount}`);
            }

            return result;
        } catch (error) {
            // 清除超时定时器
            clearTimeout(timeoutId);

            // 重新抛出错误让调用方处理
            throw error;
        }
    }
}
