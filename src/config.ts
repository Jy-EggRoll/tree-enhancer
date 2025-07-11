/**
 * 配置管理模块
 * 负责读取和管理扩展的配置项，包括国际化模板
 */

import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

/**
 * 配置管理器类
 * 提供统一的配置访问接口和默认值管理
 */
export class ConfigManager {
    /** 配置命名空间 */
    private static readonly CONFIG_SECTION = 'eggroll-tree-enhancer';

    /**
     * 获取完整的扩展配置
     * @returns 包含所有配置项的对象
     */
    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        return {
            maxCalculationTime: config.get<number>('maxCalculationTime', 5000),
            fileSizeBase: config.get<number>('fileSizeBase', 1000),
            debugMode: config.get<boolean>('debugMode', false),
            fileTemplate: config.get<string>('fileTemplate', '文件：{name} | 大小：{size} | 修改于：{modifiedTime}'),
            folderTemplate: config.get<string>('folderTemplate', '文件夹：{name} | 大小：{size} | 子文件总数：{fileCount} | 子文件夹总数：{folderCount} | 修改于：{modifiedTime}'),
            folderCalculatingTemplate: config.get<string>('folderCalculatingTemplate', '文件夹：{name} | 正在计算 | 修改于：{modifiedTime}'),
            folderTimeoutTemplate: config.get<string>('folderTimeoutTemplate', '文件夹：{name} | 文件夹过于复杂，请在设置中增加计算时间限制或采用其他工具获取信息 | 修改于：{modifiedTime}'),
            dateTimeFormat: config.get<string>('dateTimeFormat', 'YYYY-MM-DD HH:mm')
        };
    }

    /**
     * 获取特定配置项
     * @param key 配置键名
     * @param defaultValue 默认值
     * @returns 配置值
     */
    public static get<T>(key: string, defaultValue: T): T {
        return vscode.workspace.getConfiguration(this.CONFIG_SECTION).get<T>(key, defaultValue);
    }

    /**
     * 检查配置变更是否影响本扩展
     * @param event 配置变更事件
     * @returns 是否影响本扩展
     */
    public static isConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
        return event.affectsConfiguration(this.CONFIG_SECTION);
    }

    /**
     * 获取调试模式状态
     * @returns 是否启用调试模式
     */
    public static isDebugMode(): boolean {
        return this.get<boolean>('debugMode', false);
    }

    /**
     * 获取最大计算时间
     * @returns 最大计算时间（毫秒）
     */
    public static getMaxCalculationTime(): number {
        return this.get<number>('maxCalculationTime', 5000);
    }

    /**
     * 获取文件大小计算基底
     * @returns 计算基底（1000 或 1024）
     */
    public static getFileSizeBase(): number {
        return this.get<number>('fileSizeBase', 1000);
    }
}
