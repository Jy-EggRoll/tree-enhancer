import {
    FileSizeUnits,
    TemplateVariables,
    ImageDimensions,
    FolderCalculationResult,
} from "../types";
import { ConfigManager } from "../config";

/**
 * 格式化工具类，封装各种数据格式化逻辑，支持国际化和模板替换
 */
export class Formatters {
    // 文件大小单位定义
    private static readonly SIZE_UNITS: FileSizeUnits = {
        decimal: ["B", "KB", "MB", "GB", "TB", "PB"],
        binary: ["B", "KiB", "MiB", "GiB", "TiB", "PiB"],
    };

    /**
     * 格式化文件大小为人类可读的字符串，支持 1000 和 1024 两种计算基底
     * @param bytes
     * @param base
     * @returns
     */
    public static formatFileSize(bytes: number, base?: number): string {
        if (bytes === 0) return "0 B"; // 如果文件大小为 0，直接返回
        const calculationBase = base || ConfigManager.getFileSizeBase(); // 获取计算基底，优先使用参数，否则从配置读取
        const sizes =
            calculationBase === 1024
                ? this.SIZE_UNITS.binary
                : this.SIZE_UNITS.decimal; // 根据基底选择对应的单位数组
        const i = Math.floor(Math.log(bytes) / Math.log(calculationBase)); // 计算单位索引：确定应该使用哪个单位
        const unitIndex = Math.min(i, sizes.length - 1); // 确保索引不超出数组范围
        const value = bytes / Math.pow(calculationBase, unitIndex); // 计算最终数值：将字节数除以对应的基底的幂次
        return parseFloat(value.toFixed(2)) + " " + sizes[unitIndex]; // 格式化数值：保留 2 位小数，并拼接单位
    }

    /**
     * 格式化日期时间，支持自定义格式模板
     * @param date
     * @param format
     * @returns
     */
    public static formatDate(date: Date, format?: string): string {
        const dateFormat =
            format ||
            ConfigManager.get<string>("dateTimeFormat", "YYYY-MM-DD HH:mm");
        const year = date.getFullYear(); // 获取日期时间各部分
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");

        return dateFormat // 替换格式模板中的占位符
            .replace(/YYYY/g, year.toString())
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/HH/g, hours)
            .replace(/mm/g, minutes)
            .replace(/ss/g, seconds);
    }

    /**
     * 渲染模板字符串，将模板中的占位符替换为实际值
     * @param template
     * @param variables
     * @returns
     */
    public static renderTemplate(
        template: string,
        variables: TemplateVariables,
    ): string {
        let result = template;
        result = result.replace(/{name}/g, variables.name || ""); // 替换基本变量
        result = result.replace(
            /{modifiedTime}/g,
            variables.modifiedTime || "",
        );

        if (variables.size !== undefined) {
            // 替换可选变量
            result = result.replace(/{size}/g, variables.size);
        }
        if (variables.rawSize !== undefined) {
            result = result.replace(/{rawSize}/g, variables.rawSize.toString());
        }
        if (variables.fileCount !== undefined) {
            result = result.replace(
                /{fileCount}/g,
                variables.fileCount.toString(),
            );
        }
        if (variables.folderCount !== undefined) {
            result = result.replace(
                /{folderCount}/g,
                variables.folderCount.toString(),
            );
        }

        if (variables.resolution !== undefined) {
            // 替换图片分辨率相关变量，如果变量未定义则移除整个占位符
            result = result.replace(/{resolution}/g, variables.resolution);
        } else {
            result = result.replace(/{resolution}/g, ""); // 移除未定义的分辨率占位符
        }
        if (variables.width !== undefined) {
            result = result.replace(/{width}/g, variables.width.toString());
        } else {
            result = result.replace(/{width}/g, "");
        }
        if (variables.height !== undefined) {
            result = result.replace(/{height}/g, variables.height.toString());
        } else {
            result = result.replace(/{height}/g, "");
        }

        return result;
    }

    /**
     * 格式化图片分辨率信息
     * @param dimensions
     * @param template
     * @returns
     */
    public static formatImageResolution(
        dimensions: ImageDimensions,
        template?: string,
    ): string {
        const resolutionTemplate =
            template ||
            ConfigManager.get<string>(
                "imageResolutionTemplate",
                "{width} * {height}",
            );

        return resolutionTemplate
            .replace(/{width}/g, dimensions.width.toString())
            .replace(/{height}/g, dimensions.height.toString());
    }

    /**
     * 创建文件的模板变量对象
     * @param fileName
     * @param fileSize
     * @param modifiedTime
     * @param imageDimensions
     * @returns
     */
    public static createFileVariables(
        fileName: string,
        fileSize: number,
        modifiedTime: Date,
        imageDimensions?: ImageDimensions,
    ): TemplateVariables {
        const variables: TemplateVariables = {
            name: fileName,
            size: this.formatFileSize(fileSize),
            rawSize: fileSize,
            modifiedTime: this.formatDate(modifiedTime),
            rawModifiedTime: modifiedTime,
        };

        if (imageDimensions) {
            // 如果是图片文件且有尺寸信息，添加分辨率相关变量
            variables.resolution = this.formatImageResolution(imageDimensions);
            variables.width = imageDimensions.width;
            variables.height = imageDimensions.height;
        }

        return variables;
    }

    /**
     * 格式化计算结果用于状态栏显示
     * @param result 计算结果
     * @returns 格式化后的字符串
     */
    public static formatForStatusBar(result: FolderCalculationResult): string {
        const template = ConfigManager.getStatusBarTemplate();
        const base = ConfigManager.getFileSizeBase();

        // 格式化文件大小
        const formattedSize = this.formatFileSize(result.totalSize, base);

        // 格式化时间
        const formattedTime = this.formatDate(new Date(result.modifiedTime));

        // 替换模板变量
        return template
            .replace(/{folderName}/g, result.folderName)
            .replace(/{totalSize}/g, formattedSize)
            .replace(/{fileCount}/g, result.fileCount.toString())
            .replace(/{folderCount}/g, result.folderCount.toString())
            .replace(/{modifiedTime}/g, formattedTime);
    }
}
