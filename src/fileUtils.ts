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

    // 定义公共静态方法 getFileName，参数 filePath 为字符串类型（表示文件路径），方法返回字符串类型（提取出的不含路径的文件名）
    public static getFileName(filePath: string): string {
        // 获取文件名（不含路径） // 行内注释：明确该方法的核心业务目标是提取文件路径中仅文件名的部分
        const uri = this.toUri(filePath); // 调用当前类的 toUri 方法，将传入的文件路径字符串转换为 Uri 类型对象，结果赋值给常量 uri
        const pathValue = uri.path; // 从 Uri 对象中读取 path 属性（该属性存储了标准化的路径字符串），赋值给常量 pathValue
        const lastSlashIndex = pathValue.lastIndexOf("/"); // 调用字符串的 lastIndexOf 方法，查找 pathValue 中最后一个 "/" 字符的索引位置，结果赋值给常量 lastSlashIndex
        return lastSlashIndex >= 0 // 执行返回逻辑：先判断最后一个 "/" 的索引是否大于等于 0（即路径中是否包含目录分隔符）
            ? pathValue.slice(lastSlashIndex + 1) // 条件成立（存在 "/"）：截取从最后一个 "/" 的下一个索引开始到字符串末尾的子串（即纯文件名部分）
            : pathValue; // 条件不成立（无 "/"）：直接返回原路径字符串（此时路径本身就是完整的文件名）
    }

    // public static joinPath(basePath: string, relativePath: string): string {
    //     // 连接路径
    //     return vscode.Uri.joinPath(this.toUri(basePath), relativePath).fsPath;
    // }

    public static logFileError(error: any, filePath: string): void {
        // 记录文件访问错误，智能地记录不同类型的文件访问错误
        const errorCode = error?.code;
        log.warn("[文件访问错误]", filePath, errorCode || error);
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
