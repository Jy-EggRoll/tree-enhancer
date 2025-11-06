import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

export class ConfigManager { // 配置管理器类，提供统一的配置访问接口和默认值管理
    private static readonly CONFIG_SECTION = 'eggroll-tree-enhancer'; // 配置命名空间

    public static getConfig(): ExtensionConfig { // 获取完整的扩展配置
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        return {
            maxCalculationTime: config.get<number>('maxCalculationTime', 100),
            fileSizeBase: config.get<number>('fileSizeBase', 1000),
            debugMode: config.get<boolean>('debugMode', false),
            fileTemplate: config.get<string>('fileTemplate', 'Info: \nsize: {size}\nmodTime: {modifiedTime}'),
            imageFileTemplate: config.get<string>('imageFileTemplate', 'Info: \nsize: {size}\n{resolution}\nmodTime: {modifiedTime}'),
            folderTemplate: config.get<string>('folderTemplate', 'Info: \nsize: {size}\nchildFile: {fileCount}\nchildFolder: {folderCount}\nmodTime: {modifiedTime}'),
            folderCalculatingTemplate: config.get<string>('folderCalculatingTemplate', 'Info: \nCalculating...\nmodTime: {modifiedTime}'),
            folderTimeoutTemplate: config.get<string>('folderTimeoutTemplate', 'Info: \nFolder is too complex, please increase the calculation time limit in the settings or use other tools to obtain information\nmodTime: {modifiedTime}'),
            dateTimeFormat: config.get<string>('dateTimeFormat', 'YYYY-MM-DD HH:mm:ss'),
            startupDelay: config.get<number>('startupDelay', 5),
            refreshInterval: config.get<number>('refreshInterval', 60)
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
        return this.get<number>('startupDelay', 5);
    }

    public static getRefreshInterval(): number { // 获取刷新间隔时间（秒）
        return this.get<number>('refreshInterval', 60);
    }
}
