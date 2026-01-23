import * as vscode from "vscode";
import { imageSize } from "image-size";
import { SUPPORTED_IMAGE_EXTENSIONS, ImageDimensions } from "./types";
import { log } from "./extension";

export class FileUtils {
    // 文件操作工具类，封装文件系统操作和路径处理逻辑
    public static async getFileStats(
        filePath: string,
    ): Promise<vscode.FileStat | null> {
        // 获取文件统计信息，安全地获取文件的 stats 信息，处理可能的错误
        try {
            return await vscode.workspace.fs.stat(this.toUri(filePath));
        } catch (error) {
            return null;
        }
    }

    public static async getDirectoryEntries(
        dirPath: string,
    ): Promise<Array<{ name: string; type: vscode.FileType }>> {
        // 获取目录内容，安全地读取目录内容，包含文件类型信息
        try {
            const entries = await vscode.workspace.fs.readDirectory(
                this.toUri(dirPath),
            );
            return entries.map(([name, type]) => ({ name, type }));
        } catch (error) {
            return [];
        }
    }

    public static getFileName(filePath: string): string {
        // 获取文件名（不含路径）
        const uri = this.toUri(filePath);
        const pathValue = uri.path;
        const lastSlashIndex = pathValue.lastIndexOf("/");
        return lastSlashIndex >= 0
            ? pathValue.slice(lastSlashIndex + 1)
            : pathValue;
    }

    public static joinPath(basePath: string, relativePath: string): string {
        // 连接路径
        return vscode.Uri.joinPath(this.toUri(basePath), relativePath).fsPath;
    }

    public static logFileError(error: any, filePath: string): void {
        // 记录文件访问错误，智能地记录不同类型的文件访问错误
        const errorCode = error?.code;
        log.warn("文件访问错误:", filePath, errorCode || error);
    }

    public static isSupportedImage(fileName: string): boolean {
        // 检查文件是否为支持的图片格式
        const dotIndex = fileName.lastIndexOf(".");
        const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
        const normalizedExtension = extension.toLowerCase();
        return SUPPORTED_IMAGE_EXTENSIONS.includes(
            normalizedExtension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number],
        );
    }

    public static async getImageDimensions(
        filePath: string,
    ): Promise<ImageDimensions | null> {
        // 获取图片文件的分辨率信息
        try {
            const data = await vscode.workspace.fs.readFile(
                this.toUri(filePath),
            );
            const dimensions = imageSize(Buffer.from(data));
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

    public static isDirectory(stat: vscode.FileStat): boolean {
        return (stat.type & vscode.FileType.Directory) !== 0;
    }

    public static isFile(stat: vscode.FileStat): boolean {
        return (stat.type & vscode.FileType.File) !== 0;
    }

    public static isDirectoryType(fileType: vscode.FileType): boolean {
        return (fileType & vscode.FileType.Directory) !== 0;
    }

    public static isFileType(fileType: vscode.FileType): boolean {
        return (fileType & vscode.FileType.File) !== 0;
    }

    private static toUri(filePath: string): vscode.Uri {
        return vscode.Uri.file(filePath);
    }
}
