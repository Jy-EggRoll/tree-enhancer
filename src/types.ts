export interface DirectoryInfo {
    // 文件夹信息计算结果
    size: number; // 总大小（字节）
    fileCount: number; // 文件数量
    folderCount: number; // 文件夹数量
    isTimeout?: boolean; // 是否为超时结果
}

export interface ExtensionConfig {
    // 扩展配置接口
    maxCalculationTime: number; // 最大计算时间（毫秒）
    fileSizeBase: number; // 文件大小计算基底（1000 或 1024）
    fileTemplate: string; // 文件模板
    imageFileTemplate: string; // 图片文件模板
    folderTemplate: string; // 文件夹模板
    folderCalculatingTemplate: string; // 文件夹计算中模板
    folderTimeoutTemplate: string; // 文件夹超时模板
    dateTimeFormat: string; // 日期时间格式
    startupDelay: number; // 启动延迟时间（秒）
    largeFileThreshold: number; // 大文件识别阈值（MB/MiB），0 表示关闭
}

export interface TemplateVariables {
    // 模板变量接口，用于替换模板中的占位符
    name: string; // 文件/文件夹名称
    size?: string; // 格式化后的大小
    rawSize?: number; // 原始大小（字节）
    fileCount?: number; // 文件数量
    folderCount?: number; // 文件夹数量
    modifiedTime: string; // 格式化后的修改时间
    rawModifiedTime: Date; // 原始修改时间
    maxCalculationTime?: number; // 最大计算时间（毫秒）
    resolution?: string; // 图片分辨率信息
    width?: number; // 图片宽度
    height?: number; // 图片高度
}

export interface FileSizeUnits {
    // 文件大小单位数组
    decimal: string[]; // 十进制单位（1000 进制）
    binary: string[]; // 二进制单位（1024 进制）
}

export interface ImageDimensions {
    // 图片尺寸信息
    width: number; // 图片宽度
    height: number; // 图片高度
}

export const SUPPORTED_IMAGE_EXTENSIONS = [
    // 支持的图片格式常量
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
] as const;
