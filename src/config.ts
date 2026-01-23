import * as vscode from "vscode";
import { ExtensionConfig } from "./types";

export class ConfigManager {
    // 配置管理器类，提供统一的配置访问接口和默认值管理
    private static readonly CONFIG_SECTION = "tree-enhancer"; // 配置命名空间

    public static getConfig(): ExtensionConfig {
        // 获取完整的扩展配置
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        const rawFileTemplate = config.get<{ fileString?: string }>(
            "fileTemplate",
            { fileString: "Please restart VSCode" },
        );
        const rawImageFileTemplate = config.get<{
            imageFileString?: string;
        }>("imageFileTemplate", { imageFileString: "Please restart VSCode" });

        return {
            maxCalculationTime: config.get<number>("maxCalculationTime", 100),
            fileSizeBase: config.get<number>("fileSizeBase", 1000),
            fileTemplate: rawFileTemplate.fileString || "Please restart VSCode",
            imageFileTemplate:
                rawImageFileTemplate.imageFileString || "Please restart VSCode",
            dateTimeFormat: config.get<string>(
                "dateTimeFormat",
                "YYYY-MM-DD HH:mm:ss",
            ),
            startupDelay: config.get<number>("startupDelay", 0),
            largeFileThreshold: config.get<number>("largeFileThreshold", 20),
        };
    }

    public static get<T>(key: string, defaultValue: T): T {
        // 获取特定配置项
        return vscode.workspace
            .getConfiguration(this.CONFIG_SECTION)
            .get<T>(key, defaultValue);
    }

    public static isConfigChanged(
        event: vscode.ConfigurationChangeEvent,
    ): boolean {
        // 检查配置变更是否影响本扩展
        return event.affectsConfiguration(this.CONFIG_SECTION);
    }

    public static getFileSizeBase(): number {
        // 获取文件大小计算基底（1000 或 1024）
        return this.get<number>("fileSizeBase", 1000);
    }

    public static getStartupDelay(): number {
        // 获取启动延迟时间（秒）
        return this.get<number>("startupDelay", 0);
    }

    public static getLargeFileThreshold(): number {
        // 获取大文件识别阈值（MB/MiB）
        return this.get<number>("largeFileThreshold", 20);
    }
}
