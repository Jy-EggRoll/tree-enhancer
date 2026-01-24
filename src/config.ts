import * as vscode from "vscode";
import { ExtensionConfig, FolderCalculatorConfig } from "./types";

/**
 * 配置管理器类，提供统一的配置访问接口和默认值管理
 */
export class ConfigManager {
    private static readonly CONFIG_SECTION = "tree-enhancer"; // 配置命名空间

    /**
     * 获取完整的扩展配置
     */
    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        const rawFileTemplate = config.get<{ fileString?: string }>(
            "fileTemplate",
            { fileString: "Please restart VSCode" },
        );

        const rawImageFileTemplate = config.get<{
            imageFileString?: string;
        }>("imageFileTemplate", { imageFileString: "Please restart VSCode" });

        return {
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

    // 获取特定配置项
    public static get<T>(key: string, defaultValue: T): T {
        return vscode.workspace
            .getConfiguration(this.CONFIG_SECTION)
            .get<T>(key, defaultValue);
    }

    // 检查配置变更是否影响本扩展
    public static isConfigChanged(
        event: vscode.ConfigurationChangeEvent,
    ): boolean {
        return event.affectsConfiguration(this.CONFIG_SECTION);
    }

    // 获取文件大小计算基底（1000 或 1024）
    public static getFileSizeBase(): number {
        return this.get<number>("fileSizeBase", 1000);
    }

    // 获取启动延迟时间（秒）
    public static getStartupDelay(): number {
        return this.get<number>("startupDelay", 0);
    }

    // 获取大文件识别阈值（MB/MiB）
    public static getLargeFileThreshold(): number {
        return this.get<number>("largeFileThreshold", 20);
    }

    // 获取文件夹计算器配置
    public static getFolderCalculatorConfig(): FolderCalculatorConfig {
        return {
            statusBarTemplate: this.get<string>(
                "folderCalculator.statusBarTemplate",
                "Please restart VSCode",
            ),
            statusBarDismissDelay: this.get<number>(
                "folderCalculator.dismissDelay",
                60,
            ),
            fileSizeBase: this.getFileSizeBase(),
        };
    }

    // 获取状态栏模板
    public static getStatusBarTemplate(): string {
        return this.get<string>(
            "folderCalculator.statusBarTemplate",
            "Please restart VSCode",
        );
    }

    // 获取状态栏消失延迟（秒）
    public static getStatusBarDismissDelay(): number {
        return this.get<number>("folderCalculator.dismissDelay", 60);
    }
}
