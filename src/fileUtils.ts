/**
 * 文件操作工具模块
 * 提供文件系统相关的工具函数
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 文件操作工具类
 * 封装文件系统操作和路径处理逻辑
 */
export class FileUtils {
    /**
     * 判断路径是否应该被处理
     * 过滤掉 VS Code 内部文件、系统文件等不相关的路径
     * 
     * @param fsPath 文件系统路径
     * @returns 是否应该处理该路径
     */
    public static shouldProcessPath(fsPath: string): boolean {
        const normalizedPath = fsPath.toLowerCase().replace(/\\/g, '/');

        // 基本过滤条件
        if (!fsPath || fsPath.trim() === '') {
            return false;
        }

        // 只处理工作区内的文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const isInWorkspace = workspaceFolders.some(folder => {
                const workspacePath = folder.uri.fsPath.toLowerCase().replace(/\\/g, '/');
                return normalizedPath.startsWith(workspacePath);
            });

            // 如果有工作区但文件不在工作区内，跳过
            if (!isInWorkspace) {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取文件统计信息
     * 安全地获取文件的 stats 信息，处理可能的错误
     * 
     * @param filePath 文件路径
     * @returns 文件统计信息，失败时返回 null
     */
    public static async getFileStats(filePath: string): Promise<fs.Stats | null> {
        try {
            return await fs.promises.stat(filePath);
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取目录内容
     * 安全地读取目录内容，包含文件类型信息
     * 
     * @param dirPath 目录路径
     * @returns 目录内容数组，失败时返回空数组
     */
    public static async getDirectoryEntries(dirPath: string): Promise<fs.Dirent[]> {
        try {
            return await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            return [];
        }
    }

    /**
     * 获取文件名（不含路径）
     * 
     * @param filePath 文件路径
     * @returns 文件名
     */
    public static getFileName(filePath: string): string {
        return path.basename(filePath);
    }

    /**
     * 连接路径
     * 
     * @param basePath 基础路径
     * @param relativePath 相对路径
     * @returns 连接后的完整路径
     */
    public static joinPath(basePath: string, relativePath: string): string {
        return path.join(basePath, relativePath);
    }

    /**
     * 记录文件访问错误
     * 智能地记录不同类型的文件访问错误
     * 
     * @param error 错误对象
     * @param filePath 文件路径
     */
    public static logFileError(error: any, filePath: string): void {
        const errorCode = error?.code;

        if (errorCode === 'ENOENT') {
            // 文件不存在错误 - 只记录用户文件的情况
            if (filePath && filePath.length > 20) { // 只记录较长路径的错误，通常是用户文件
                console.warn(`文件可能已被删除: ${filePath}`);
            }
        } else if (errorCode === 'EACCES') {
            // 权限问题
            console.warn(`无权限访问文件: ${filePath}`);
        } else {
            // 其他类型的错误可能更重要
            console.warn('文件访问错误:', filePath, errorCode || error);
        }
    }
}
