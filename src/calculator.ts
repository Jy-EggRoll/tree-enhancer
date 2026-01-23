import { DirectoryInfo } from "./types"; // 类型定义，描述目录信息结构
import { FileUtils } from "./fileUtils"; // 文件工具类，封装文件系统操作
import { ConfigManager } from "./config"; // 配置管理器，获取全局配置
import { log } from "./extension"; // 扩展日志工具，用于输出调试信息

export class DirectoryCalculator {
    // 定义目录计算器类，提供目录信息统计相关功能
    // 文件夹信息计算器，递归统计文件夹大小、文件数、文件夹数，支持取消
    public static async calculateDirectoryInfo(
        // 定义静态异步方法，用于递归计算目录信息
        dirPath: string, // 入参：需要计算的目录路径，字符串类型
        signal?: AbortSignal, // 入参：可选的取消信号，用于终止正在进行的计算
    ): Promise<DirectoryInfo> {
        // 方法返回值：Promise 类型，解析后为 DirectoryInfo 类型的目录信息
        // 递归计算文件夹信息，支持取消
        if (signal?.aborted) {
            // 判断取消信号是否已触发终止
            throw new Error("Calculation aborted"); // 触发终止则抛出计算取消的错误
        } // 检查是否被取消
        if (ConfigManager.isDebugMode()) {
            // 判断是否开启调试模式
            log.info(`开始计算文件夹: ${dirPath}`); // 调试模式下记录开始计算指定目录的日志
        } // 调试：记录开始计算
        try {
            // 捕获计算过程中可能出现的异常
            let totalSize = 0; // 初始化目录总大小为 0，单位为字节
            let fileCount = 0; // 初始化目录内文件总数为 0
            let folderCount = 0; // 初始化目录内子文件夹总数为 0
            const items = await FileUtils.getDirectoryEntries(dirPath); // 异步获取指定目录下的所有文件/文件夹条目
            if (ConfigManager.isDebugMode()) {
                // 判断是否开启调试模式
                log.info(`文件夹 ${dirPath} 包含 ${items.length} 个项目`); // 调试模式下记录当前目录的条目数量
            } // 调试：记录项目数量
            for (const item of items) {
                // 遍历当前目录下的每一个文件/文件夹条目
                // 遍历每个项目
                if (signal?.aborted) {
                    // 遍历过程中再次检查取消信号是否触发
                    throw new Error("Calculation aborted"); // 触发则抛出计算取消的错误
                } // 再次检查取消
                const itemPath = FileUtils.joinPath(dirPath, item.name); // 拼接当前条目完整的文件系统路径
                try {
                    // 捕获单个条目处理过程中的异常（如权限不足）
                    if (FileUtils.isDirectoryType(item.type)) {
                        // 判断当前条目是否为文件夹
                        // 是文件夹
                        folderCount++; // 文件夹计数加 1
                        const subResult = await this.calculateDirectoryInfo(
                            // 递归调用自身，计算子文件夹的信息
                            itemPath, // 子文件夹的完整路径
                            signal, // 传递取消信号
                        ); // 递归
                        totalSize += subResult.size; // 将子文件夹的大小累加到总大小
                        fileCount += subResult.fileCount; // 将子文件夹的文件数累加到总文件数
                        folderCount += subResult.folderCount; // 将子文件夹的文件夹数累加到总文件夹数
                    } else if (FileUtils.isFileType(item.type)) {
                        // 判断当前条目是否为文件
                        // 是文件
                        fileCount++; // 文件计数加 1
                        const stats = await FileUtils.getFileStats(itemPath); // 异步获取文件的统计信息（包含大小）
                        if (stats) {
                            // 判断是否成功获取文件统计信息
                            totalSize += stats.size; // 将当前文件大小累加到总大小
                        }
                    }
                } catch (error) {
                    // 捕获单个条目处理的异常
                    if ((error as Error).message !== "Calculation aborted") {
                        // 排除计算取消的错误
                        // 忽略无法访问的项
                        if (ConfigManager.isDebugMode()) {
                            // 判断是否开启调试模式
                            console.warn(`无法访问: ${itemPath}`, error); // 调试模式下输出无法访问条目的警告日志
                        }
                    }
                    if ((error as Error).message === "Calculation aborted") {
                        // 判断是否为计算取消的错误
                        throw error; // 重新抛出取消错误，终止整个计算流程
                    } // 取消操作直接抛出
                }
            }
            if (ConfigManager.isDebugMode()) {
                // 判断是否开启调试模式
                log.info(
                    `文件夹 ${dirPath} 计算完成: 大小=${totalSize}, 文件=${fileCount}, 文件夹=${folderCount}`,
                ); // 调试模式下记录当前目录的计算结果
            } // 调试：记录计算结果
            return { size: totalSize, fileCount, folderCount }; // 返回当前目录的统计结果（大小、文件数、文件夹数）
        } catch (error) {
            // 捕获整个目录计算过程中的异常
            if (
                signal?.aborted || // 判断取消信号是否触发
                (error as Error).message === "Calculation aborted" // 或错误信息为计算取消
            ) {
                throw error; // 重新抛出取消错误，让上层处理
            } // 取消操作抛出
            if (ConfigManager.isDebugMode()) {
                // 判断是否开启调试模式
                console.error(`计算目录信息失败: ${dirPath}`, error); // 调试模式下输出目录计算失败的错误日志
            }
            return { size: 0, fileCount: 0, folderCount: 0 }; // 非取消类错误返回空统计结果（所有值为 0）
        }
    }

    public static async calculateWithTimeout(
        // 定义静态异步方法，提供带超时控制的目录计算功能
        // 创建带超时的计算任务，封装计算逻辑，自动处理超时控制
        dirPath: string, // 入参：需要计算的目录路径，字符串类型
        timeoutMs?: number, // 入参：可选的超时时间，单位为毫秒
    ): Promise<DirectoryInfo> {
        // 方法返回值：Promise 类型，解析后为 DirectoryInfo 类型的目录信息
        const timeout = timeoutMs || ConfigManager.getMaxCalculationTime(); // 确定最终超时时间：优先使用传入值，无则取配置的最大计算时间
        if (ConfigManager.isDebugMode()) {
            // 判断是否开启调试模式
            log.info(`开始带超时的文件夹计算: ${dirPath}, 超时=${timeout}ms`); // 调试模式下记录超时计算的开始日志
        } // 调试：记录超时计算开始
        const abortController = new AbortController(); // 创建 AbortController 实例，用于控制计算任务的取消
        const timeoutId = setTimeout(() => {
            // 设置超时定时器，到达指定时间后执行回调
            // 设置超时定时器
            if (ConfigManager.isDebugMode()) {
                // 判断是否开启调试模式
                log.info(`文件夹计算超时，已取消: ${dirPath} (${timeout}ms)`); // 调试模式下记录计算超时并取消的日志
            }
            abortController.abort(); // 触发 AbortController 的取消信号，终止计算任务
        }, timeout); // 定时器延迟时间为最终确定的超时时间

        try {
            // 捕获带超时计算过程中的异常
            const result = await this.calculateDirectoryInfo(
                // 调用核心计算方法，传入目录路径和取消信号
                dirPath, // 需要计算的目录路径
                abortController.signal, // 关联超时的取消信号
            ); // 开始计算文件夹信息
            clearTimeout(timeoutId); // 计算成功完成，清除超时定时器避免误触发
            if (ConfigManager.isDebugMode()) {
                // 判断是否开启调试模式
                log.info(
                    `文件夹计算完成: ${dirPath}, 大小: ${result.size}, 文件: ${result.fileCount}, 文件夹: ${result.folderCount}`,
                ); // 调试模式下记录计算完成的结果日志
            }
            return result; // 返回计算得到的目录信息
        } catch (error) {
            // 捕获计算过程中的异常（包括超时取消）
            clearTimeout(timeoutId); // 清除超时定时器，避免资源泄漏
            throw error; // 重新抛出错误，让调用方处理
        }
    }
}
