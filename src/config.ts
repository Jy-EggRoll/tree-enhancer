import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

export class ConfigManager { // 配置管理器类，提供统一的配置访问接口和默认值管理
    private static readonly CONFIG_SECTION = 'tree-enhancer'; // 配置命名空间

    public static getConfig(): ExtensionConfig { // 获取完整的扩展配置
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        return {
            maxCalculationTime: config.get<number>('maxCalculationTime', 100),
            fileSizeBase: config.get<number>('fileSizeBase', 1000),
            debugMode: config.get<boolean>('debugMode', false),
            fileTemplate: config.get<string>('fileTemplate', 'Please restart VS Code to apply the localization tooltip.'),
            imageFileTemplate: config.get<string>('imageFileTemplate', 'Please restart VS Code to apply the localization tooltip.'),
            folderTemplate: config.get<string>('folderTemplate', 'Please restart VS Code to apply the localization tooltip.'),
            folderCalculatingTemplate: config.get<string>('folderCalculatingTemplate', 'Please restart VS Code to apply the localization tooltip.'),
            folderTimeoutTemplate: config.get<string>('folderTimeoutTemplate', 'Please restart VS Code to apply the localization tooltip.'),
            dateTimeFormat: config.get<string>('dateTimeFormat', 'YYYY-MM-DD HH:mm:ss'),
            startupDelay: config.get<number>('startupDelay', 0),
            refreshInterval: config.get<number>('refreshInterval', 60),
            largeFileThreshold: config.get<number>('largeFileThreshold', 50)
        };
    }

    public static get<T>(key: string, defaultValue: T): T { // 获取特定配置项
        return vscode.workspace.getConfiguration(this.CONFIG_SECTION).get<T>(key, defaultValue);
    }

    public static isConfigChanged(event: vscode.ConfigurationChangeEvent): boolean { // 检查配置变更是否影响本扩展
        return event.affectsConfiguration(this.CONFIG_SECTION);
    }

    public static isDebugMode(): boolean { // 获取调试模式状态
        return this.get<boolean>('debugMode', false);
    }

    public static getMaxCalculationTime(): number { // 获取最大计算时间（毫秒）
        return this.get<number>('maxCalculationTime', 5000);
    }

    public static getFileSizeBase(): number { // 获取文件大小计算基底（1000 或 1024）
        return this.get<number>('fileSizeBase', 1000);
    }

    public static getStartupDelay(): number { // 获取启动延迟时间（秒）
        return this.get<number>('startupDelay', 0);
    }

    public static getRefreshInterval(): number { // 获取刷新间隔时间（秒）
        return this.get<number>('refreshInterval', 60);
    }

    public static getLargeFileThreshold(): number { // 获取大文件识别阈值（MB/MiB）
        return this.get<number>('largeFileThreshold', 50);
    }
}