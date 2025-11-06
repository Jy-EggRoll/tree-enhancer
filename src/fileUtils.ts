import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { imageSizeFromFile } from 'image-size/fromFile';
import { SUPPORTED_IMAGE_EXTENSIONS, ImageDimensions } from './types';
import { ConfigManager } from './config';

export class FileUtils { // 文件操作工具类，封装文件系统操作和路径处理逻辑
    public static shouldProcessPath(fsPath: string): boolean { // 判断路径是否应该被处理，过滤掉VS Code内部文件、系统文件等不相关的路径
        const normalizedPath = fsPath.toLowerCase().replace(/\\/g, '/');

        if (!fsPath || fsPath.trim() === '') { // 基本过滤条件
            return false;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders; // 只处理工作区内的文件
        if (workspaceFolders && workspaceFolders.length > 0) {
            const isInWorkspace = workspaceFolders.some(folder => {
                const workspacePath = folder.uri.fsPath.toLowerCase().replace(/\\/g, '/');
                return normalizedPath.startsWith(workspacePath);
            });
            if (!isInWorkspace) { // 如果有工作区但文件不在工作区内，跳过
                return false;
            }
        }

        return true;
    }

    public static async getFileStats(filePath: string): Promise<fs.Stats | null> { // 获取文件统计信息，安全地获取文件的stats信息，处理可能的错误
        try {
            return await fs.promises.stat(filePath);
        } catch (error) {
            return null;
        }
    }

    public static async getDirectoryEntries(dirPath: string): Promise<fs.Dirent[]> { // 获取目录内容，安全地读取目录内容，包含文件类型信息
        try {
            return await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            return [];
        }
    }

    public static getFileName(filePath: string): string { // 获取文件名（不含路径）
        return path.basename(filePath);
    }

    public static joinPath(basePath: string, relativePath: string): string { // 连接路径
        return path.join(basePath, relativePath);
    }

    public static logFileError(error: any, filePath: string): void { // 记录文件访问错误，智能地记录不同类型的文件访问错误
        if (!ConfigManager.isDebugMode()) return; // 只在调试模式下记录错误
        const errorCode = error?.code;

        if (errorCode === 'ENOENT') { // 文件不存在错误 - 只记录用户文件的情况
            if (filePath && filePath.length > 20) { // 只记录较长路径的错误，通常是用户文件
                console.warn(`文件可能已被删除: ${filePath}`);
            }
        } else if (errorCode === 'EACCES') { // 权限问题
            console.warn(`无权限访问文件: ${filePath}`);
        } else { // 其他类型的错误可能更重要
            console.warn('文件访问错误:', filePath, errorCode || error);
        }
    }

    public static isSupportedImage(fileName: string): boolean { // 检查文件是否为支持的图片格式
        const extension = path.extname(fileName).toLowerCase();
        return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as any);
    }

    public static async getImageDimensions(filePath: string): Promise<ImageDimensions | null> { // 获取图片文件的分辨率信息
        try {
            const dimensions = await imageSizeFromFile(filePath);
            if (dimensions.width && dimensions.height) {
                return {
                    width: dimensions.width,
                    height: dimensions.height
                };
            }
            return null;
        } catch (error) { // 图片读取失败，静默处理
            return null;
        }
    }
}
