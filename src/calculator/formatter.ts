import { FolderCalculationResult } from "../types";
import { ConfigManager } from "../config";
import { formatFileSize, formatDateTime } from "../utils/formatters";

/**
 * 文件夹计算结果格式化器
 * 负责将计算结果格式化为可读的字符串
 */
export class ResultFormatter {
    /**
     * 格式化计算结果用于状态栏显示
     * @param result 计算结果
     * @returns 格式化后的字符串
     */
    public static formatForStatusBar(result: FolderCalculationResult): string {
        const template = ConfigManager.getStatusBarTemplate();
        const base = ConfigManager.getFileSizeBase();

        // 格式化文件大小
        const formattedSize = formatFileSize(result.totalSize, base);

        // 格式化时间
        const formattedTime = formatDateTime(result.modifiedTime);

        // 替换模板变量
        return template
            .replace(/{folderName}/g, result.folderName)
            .replace(/{totalSize}/g, formattedSize)
            .replace(/{fileCount}/g, result.fileCount.toString())
            .replace(/{folderCount}/g, result.folderCount.toString())
            .replace(/{modifiedTime}/g, formattedTime);
    }

    /**
     * 格式化计算结果用于工具提示
     * @param result 计算结果
     * @returns 格式化后的字符串
     */
    public static formatForTooltip(result: FolderCalculationResult): string {
        const base = ConfigManager.getFileSizeBase();
        const formattedSize = formatFileSize(result.totalSize, base);
        const formattedTime = formatDateTime(result.modifiedTime);

        return [
            `Folder: ${result.folderName}`,
            `Total Size: ${formattedSize}`,
            `Files: ${result.fileCount}`,
            `Folders: ${result.folderCount}`,
            `Modified: ${formattedTime}`,
        ].join("\n");
    }
}
