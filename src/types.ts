// 扩展配置接口
export interface ExtensionConfig {
    // maxCalculationTime: number; // 最大计算时间（毫秒）
    fileSizeBase: number; // 文件大小计算基底（1000 或 1024）
    fileTemplate: string; // 文件模板
    imageFileTemplate: string; // 图片文件模板
    dateTimeFormat: string; // 日期时间格式
    startupDelay: number; // 启动延迟时间（秒）
    largeFileThreshold: number; // 大文件识别阈值（MB/MiB），0 表示关闭
}

// 模板变量接口，用于替换模板中的占位符
export interface TemplateVariables {
    name: string; // 文件/文件夹名称
    size?: string; // 格式化后的大小
    rawSize?: number; // 原始大小（字节）
    fileCount?: number; // 文件数量
    folderCount?: number; // 文件夹数量
    modifiedTime: string; // 格式化后的修改时间
    rawModifiedTime: Date; // 原始修改时间
    resolution?: string; // 图片分辨率信息
    width?: number; // 图片宽度
    height?: number; // 图片高度
}

// 文件大小单位数组
export interface FileSizeUnits {
    decimal: string[]; // 十进制单位（1000 进制）
    binary: string[]; // 二进制单位（1024 进制）
}

// 图片尺寸信息
export interface ImageDimensions {
    width: number; // 图片宽度
    height: number; // 图片高度
}

// 支持的图片格式常量
export const SUPPORTED_IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
] as const;

// 文件夹计算结果类型定义
export interface FolderCalculationResult {
    /** 文件夹名称 */
    folderName: string;
    /** 文件夹总大小（字节） */
    totalSize: number;
    /** 子文件总数 */
    fileCount: number;
    /** 子文件夹总数 */
    folderCount: number;
    /** 最后修改时间（毫秒时间戳） */
    modifiedTime: number;
    /** 文件夹 URI */
}

// 文件夹计算配置
export interface FolderCalculatorConfig {
    /** 状态栏显示模板 */
    statusBarTemplate: string;
    /** 状态栏消失延迟（秒） */
    statusBarDismissDelay: number;
    /** 文件大小计算基数（1000 或 1024） */
    fileSizeBase: number;
}