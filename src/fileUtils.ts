import * as fs from "fs";
import * as path from "path";
import { imageSizeFromFile } from "image-size/fromFile";
import { SUPPORTED_IMAGE_EXTENSIONS, ImageDimensions } from "./types";
import { ConfigManager } from "./config";

export class FileUtils {
    // 文件操作工具类，封装文件系统操作和路径处理逻辑
    public static async getFileStats(
        filePath: string,
    ): Promise<fs.Stats | null> {
        // 获取文件统计信息，安全地获取文件的 stats 信息，处理可能的错误
        try {
            return await fs.promises.stat(filePath);
        } catch (error) {
            return null;
        }
    }

    public static async getDirectoryEntries(
        dirPath: string,
    ): Promise<fs.Dirent[]> {
        // 获取目录内容，安全地读取目录内容，包含文件类型信息
        try {
            return await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            return [];
        }
    }

    public static getFileName(filePath: string): string {
        // 获取文件名（不含路径）
        return path.basename(filePath);
    }

    public static joinPath(basePath: string, relativePath: string): string {
        // 连接路径
        return path.join(basePath, relativePath);
    }

    public static logFileError(error: any, filePath: string): void {
        // 记录文件访问错误，智能地记录不同类型的文件访问错误
        if (!ConfigManager.isDebugMode()) return; // 只在调试模式下记录错误
        const errorCode = error?.code;
        console.warn("文件访问错误:", filePath, errorCode || error); // 简单直接记录错误即可，不需要复杂处理
    }

    public static isSupportedImage(fileName: string): boolean {
        // 检查文件是否为支持的图片格式
        const extension = path.extname(fileName).toLowerCase();
        return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as any);
    }

    public static async getImageDimensions(
        filePath: string,
    ): Promise<ImageDimensions | null> {
        // 获取图片文件的分辨率信息
        try {
            const dimensions = await imageSizeFromFile(filePath);
            if (dimensions.width && dimensions.height) {
                return {
                    width: dimensions.width,
                    height: dimensions.height,
                };
            }
            return null;
        } catch (error) {
            // 图片读取失败，静默处理
            return null;
        }
    }
}
