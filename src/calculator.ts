import { DirectoryInfo } from "./types"; // 类型定义，描述目录信息结构
import { FileUtils } from "./fileUtils"; // 文件工具类，封装文件系统操作
import { ConfigManager } from "./config"; // 配置管理器，获取全局配置

export class DirectoryCalculator {
    // 文件夹信息计算器，递归统计文件夹大小、文件数、文件夹数，支持取消
    public static async calculateDirectoryInfo(
        dirPath: string,
        signal?: AbortSignal,
    ): Promise<DirectoryInfo> {
        // 递归计算文件夹信息，支持取消
        if (signal?.aborted) {
            throw new Error("Calculation aborted");
        } // 检查是否被取消
        if (ConfigManager.isDebugMode()) {
            console.log(`开始计算文件夹: ${dirPath}`);
        } // 调试：记录开始计算
        try {
            let totalSize = 0; // 总大小
            let fileCount = 0; // 文件数
            let folderCount = 0; // 文件夹数
            const items = await FileUtils.getDirectoryEntries(dirPath); // 读取目录内容
            if (ConfigManager.isDebugMode()) {
                console.log(`文件夹 ${dirPath} 包含 ${items.length} 个项目`);
            } // 调试：记录项目数量
            for (const item of items) {
                // 遍历每个项目
                if (signal?.aborted) {
                    throw new Error("Calculation aborted");
                } // 再次检查取消
                const itemPath = FileUtils.joinPath(dirPath, item.name); // 拼接完整路径
                try {
                    if (item.isDirectory()) {
                        // 是文件夹
                        folderCount++;
                        const subResult = await this.calculateDirectoryInfo(
                            itemPath,
                            signal,
                        ); // 递归
                        totalSize += subResult.size;
                        fileCount += subResult.fileCount;
                        folderCount += subResult.folderCount;
                    } else if (item.isFile()) {
                        // 是文件
                        fileCount++;
                        const stats = await FileUtils.getFileStats(itemPath); // 获取文件大小
                        if (stats) {
                            totalSize += stats.size;
                        }
                    }
                } catch (error) {
                    if ((error as Error).message !== "Calculation aborted") {
                        // 忽略无法访问的项
                        if (ConfigManager.isDebugMode()) {
                            console.warn(`无法访问: ${itemPath}`, error);
                        }
                    }
                    if ((error as Error).message === "Calculation aborted") {
                        throw error;
                    } // 取消操作直接抛出
                }
            }
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `文件夹 ${dirPath} 计算完成: 大小=${totalSize}, 文件=${fileCount}, 文件夹=${folderCount}`,
                );
            } // 调试：记录计算结果
            return { size: totalSize, fileCount, folderCount }; // 返回统计结果
        } catch (error) {
            if (
                signal?.aborted ||
                (error as Error).message === "Calculation aborted"
            ) {
                throw error;
            } // 取消操作抛出
            if (ConfigManager.isDebugMode()) {
                console.error(`计算目录信息失败: ${dirPath}`, error);
            }
            return { size: 0, fileCount: 0, folderCount: 0 }; // 失败返回 0
        }
    }

    public static async calculateWithTimeout(
        // 创建带超时的计算任务，封装计算逻辑，自动处理超时控制
        dirPath: string,
        timeoutMs?: number,
    ): Promise<DirectoryInfo> {
        const timeout = timeoutMs || ConfigManager.getMaxCalculationTime();
        if (ConfigManager.isDebugMode()) {
            console.log(
                `开始带超时的文件夹计算: ${dirPath}, 超时=${timeout}ms`,
            );
        } // 调试：记录超时计算开始
        const abortController = new AbortController(); // 创建取消控制器，用于实现超时功能
        const timeoutId = setTimeout(() => {
            // 设置超时定时器
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `文件夹计算超时，已取消: ${dirPath} (${timeout}ms)`,
                );
            }
            abortController.abort(); // 发送取消信号
        }, timeout);

        try {
            const result = await this.calculateDirectoryInfo(
                dirPath,
                abortController.signal,
            ); // 开始计算文件夹信息
            clearTimeout(timeoutId); // 计算成功完成，清除超时定时器
            if (ConfigManager.isDebugMode()) {
                console.log(
                    `文件夹计算完成: ${dirPath}, 大小: ${result.size}, 文件: ${result.fileCount}, 文件夹: ${result.folderCount}`,
                );
            }
            return result;
        } catch (error) {
            clearTimeout(timeoutId); // 清除超时定时器
            throw error; // 重新抛出错误让调用方处理
        }
    }
}
