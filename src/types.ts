/**
 * 类型定义文件
 * 定义了扩展中使用的所有接口和类型
 */

/**
 * 文件夹信息计算结果
 */
export interface DirectoryInfo {
    /** 总大小（字节） */
    size: number;
    /** 文件数量 */
    fileCount: number;
    /** 文件夹数量 */
    folderCount: number;
    /** 是否为超时结果 */
    isTimeout?: boolean;
}

/**
 * 扩展配置接口
 */
export interface ExtensionConfig {
    /** 最大计算时间（毫秒） */
    maxCalculationTime: number;
    /** 文件大小计算基底（1000 或 1024） */
    fileSizeBase: number;
    /** 调试模式开关 */
    debugMode: boolean;
    /** 文件模板 */
    fileTemplate: string;
    /** 文件夹模板 */
    folderTemplate: string;
    /** 文件夹计算中模板 */
    folderCalculatingTemplate: string;
    /** 文件夹超时模板 */
    folderTimeoutTemplate: string;
    /** 日期时间格式 */
    dateTimeFormat: string;
}

/**
 * 模板变量接口
 * 用于替换模板中的占位符
 */
export interface TemplateVariables {
    /** 文件/文件夹名称 */
    name: string;
    /** 格式化后的大小 */
    size?: string;
    /** 原始大小（字节） */
    rawSize?: number;
    /** 文件数量 */
    fileCount?: number;
    /** 文件夹数量 */
    folderCount?: number;
    /** 格式化后的修改时间 */
    modifiedTime: string;
    /** 原始修改时间 */
    rawModifiedTime: Date;
    /** 最大计算时间（毫秒） */
    maxCalculationTime?: number;
}

/**
 * 文件大小单位数组
 */
export interface FileSizeUnits {
    /** 十进制单位（1000 进制） */
    decimal: string[];
    /** 二进制单位（1024 进制） */
    binary: string[];
}
