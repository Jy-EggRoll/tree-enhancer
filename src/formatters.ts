/**
 * 格式化工具模块
 * 提供文件大小、日期时间和模板格式化功能
 */

import { FileSizeUnits, TemplateVariables } from './types';
import { ConfigManager } from './config';

/**
 * 格式化工具类
 * 封装各种数据格式化逻辑，支持国际化和模板替换
 */
export class Formatters {
    /** 文件大小单位定义 */
    private static readonly SIZE_UNITS: FileSizeUnits = {
        decimal: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'],
        binary: ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    };

    /**
     * 格式化文件大小为人类可读的字符串
     * 
     * 支持两种计算基底：
     * - 1000：十进制基底，使用 KB、MB、GB、TB 等单位（符合国际标准SI）
     * - 1024：二进制基底，使用 KiB、MiB、GiB、TiB 等单位（传统计算机标准）
     * 
     * @param bytes 文件大小（字节数）
     * @param base 计算基底，如果不提供则从配置中读取
     * @returns 格式化后的文件大小字符串，如 "1.54 MB" 或 "1.46 MiB"
     */
    public static formatFileSize(bytes: number, base?: number): string {
        // 如果文件大小为0，直接返回
        if (bytes === 0) return '0 B';

        // 获取计算基底，优先使用参数，否则从配置读取
        const calculationBase = base || ConfigManager.getFileSizeBase();

        // 根据基底选择对应的单位数组
        const sizes = calculationBase === 1024 ? this.SIZE_UNITS.binary : this.SIZE_UNITS.decimal;

        // 计算单位索引：确定应该使用哪个单位
        // Math.log(bytes) / Math.log(base) 计算以base为底的对数
        // Math.floor() 向下取整，得到单位级别
        const i = Math.floor(Math.log(bytes) / Math.log(calculationBase));

        // 确保索引不超出数组范围
        const unitIndex = Math.min(i, sizes.length - 1);

        // 计算最终数值：将字节数除以对应的基底的幂次
        const value = bytes / Math.pow(calculationBase, unitIndex);

        // 格式化数值：保留2位小数，并拼接单位
        // parseFloat() 用于去除不必要的尾随零
        return parseFloat(value.toFixed(2)) + ' ' + sizes[unitIndex];
    }

    /**
     * 格式化日期时间
     * 支持自定义格式模板，默认为中文友好格式
     * 
     * @param date 日期对象
     * @param format 日期格式模板，如果不提供则从配置中读取
     * @returns 格式化后的日期时间字符串
     */
    public static formatDate(date: Date, format?: string): string {
        const dateFormat = format || ConfigManager.get<string>('dateTimeFormat', 'YYYY-MM-DD HH:mm');

        // 获取日期时间各部分
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        // 替换格式模板中的占位符
        return dateFormat
            .replace(/YYYY/g, year.toString())
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/HH/g, hours)
            .replace(/mm/g, minutes)
            .replace(/ss/g, seconds);
    }

    /**
     * 渲染模板字符串
     * 将模板中的占位符替换为实际值
     * 
     * 支持的占位符：
     * - {name}: 文件/文件夹名称
     * - {size}: 格式化后的大小
     * - {rawSize}: 原始大小（字节）
     * - {fileCount}: 文件数量
     * - {folderCount}: 文件夹数量
     * - {modifiedTime}: 格式化后的修改时间
     * - {maxCalculationTime}: 最大计算时间
     * 
     * @param template 模板字符串
     * @param variables 变量对象
     * @returns 渲染后的字符串
     */
    public static renderTemplate(template: string, variables: TemplateVariables): string {
        let result = template;

        // 替换基本变量
        result = result.replace(/{name}/g, variables.name || '');
        result = result.replace(/{modifiedTime}/g, variables.modifiedTime || '');

        // 替换可选变量
        if (variables.size !== undefined) {
            result = result.replace(/{size}/g, variables.size);
        }

        if (variables.rawSize !== undefined) {
            result = result.replace(/{rawSize}/g, variables.rawSize.toString());
        }

        if (variables.fileCount !== undefined) {
            result = result.replace(/{fileCount}/g, variables.fileCount.toString());
        }

        if (variables.folderCount !== undefined) {
            result = result.replace(/{folderCount}/g, variables.folderCount.toString());
        }

        if (variables.maxCalculationTime !== undefined) {
            result = result.replace(/{maxCalculationTime}/g, variables.maxCalculationTime.toString());
        }

        return result;
    }

    /**
     * 创建文件的模板变量对象
     * 
     * @param fileName 文件名
     * @param fileSize 文件大小（字节）
     * @param modifiedTime 修改时间
     * @returns 模板变量对象
     */
    public static createFileVariables(
        fileName: string,
        fileSize: number,
        modifiedTime: Date
    ): TemplateVariables {
        return {
            name: fileName,
            size: this.formatFileSize(fileSize),
            rawSize: fileSize,
            modifiedTime: this.formatDate(modifiedTime),
            rawModifiedTime: modifiedTime
        };
    }

    /**
     * 创建文件夹的模板变量对象
     * 
     * @param folderName 文件夹名
     * @param size 文件夹大小（字节）
     * @param fileCount 文件数量
     * @param folderCount 文件夹数量
     * @param modifiedTime 修改时间
     * @returns 模板变量对象
     */
    public static createFolderVariables(
        folderName: string,
        size: number,
        fileCount: number,
        folderCount: number,
        modifiedTime: Date
    ): TemplateVariables {
        return {
            name: folderName,
            size: this.formatFileSize(size),
            rawSize: size,
            fileCount,
            folderCount,
            modifiedTime: this.formatDate(modifiedTime),
            rawModifiedTime: modifiedTime
        };
    }

    /**
     * 创建文件夹计算中状态的模板变量对象
     * 
     * @param folderName 文件夹名
     * @param modifiedTime 修改时间
     * @returns 模板变量对象
     */
    public static createCalculatingVariables(
        folderName: string,
        modifiedTime: Date
    ): TemplateVariables {
        return {
            name: folderName,
            modifiedTime: this.formatDate(modifiedTime),
            rawModifiedTime: modifiedTime
        };
    }

    /**
     * 创建文件夹超时状态的模板变量对象
     * 
     * @param folderName 文件夹名
     * @param modifiedTime 修改时间
     * @param maxCalculationTime 最大计算时间
     * @returns 模板变量对象
     */
    public static createTimeoutVariables(
        folderName: string,
        modifiedTime: Date,
        maxCalculationTime: number
    ): TemplateVariables {
        return {
            name: folderName,
            modifiedTime: this.formatDate(modifiedTime),
            rawModifiedTime: modifiedTime,
            maxCalculationTime
        };
    }
}
