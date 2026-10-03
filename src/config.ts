import * as vscode from "vscode";
import { ExtensionConfig } from "./types";

/**
 * 配置管理器类，提供统一的配置访问接口。
 *
 * 默认值的唯一事实源是 package.json 的 contributes.configuration：用户未设置时
 * VSCode 的 get() 会返回该处声明的默认值（含 nls 文案），因此本文件不再重复写
 * 一份字面量——两处各写一份必然迟早漂移。
 *
 * 代价是类型层面的：get() 的签名允许 undefined，故统一经 getConfigValue 收窄。
 * 新增配置项时必须同时在 package.json 声明默认值，否则这里会拿到 undefined。
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = "tree-enhancer"; // 配置命名空间

  /**
   * 读取配置项并向 TS 断言"一定有值"。
   * 刻意不传第二个参数：默认值只由 package.json 声明，避免两处各写一份。
   */
  private static getConfigValue<T>(key: string): T {
    return vscode.workspace
      .getConfiguration(this.CONFIG_SECTION)
      .get<T>(key) as T;
  }

  /**
   * 读取对象型模板配置的某个字段（fileTemplate / imageFileTemplate）。
   * 字段缺失时返回空串，不再自造一句兜底文案。
   */
  private static getTemplateField(key: string, field: string): string {
    const value = this.getConfigValue<Record<string, string>>(key);
    return value?.[field] ?? "";
  }

  /**
   * 获取完整的扩展配置
   */
  public static getConfig(): ExtensionConfig {
    return {
      fileSizeBase: this.getConfigValue<number>("fileSizeBase"),
      fileTemplate: this.getTemplateField("fileTemplate", "fileString"),
      imageFileTemplate: this.getTemplateField(
        "imageFileTemplate",
        "imageFileString",
      ),
      dateTimeFormat: this.getConfigValue<string>("dateTimeFormat"),
      startupDelay: this.getConfigValue<number>("startupDelay"),
      largeFileThreshold: this.getConfigValue<number>("largeFileThreshold"),
    };
  }

  /**
   * 检查配置变更是否影响本扩展
   */
  public static isConfigChanged(
    event: vscode.ConfigurationChangeEvent,
  ): boolean {
    return event.affectsConfiguration(this.CONFIG_SECTION);
  }

  /**
   * 获取文件大小计算基底（1000 或 1024）
   */
  public static getFileSizeBase(): number {
    return this.getConfigValue<number>("fileSizeBase");
  }

  /**
   * 获取启动延迟时间（秒）
   */
  public static getStartupDelay(): number {
    return this.getConfigValue<number>("startupDelay");
  }

  /**
   * 获取日期时间格式模板
   */
  public static getDateTimeFormat(): string {
    return this.getConfigValue<string>("dateTimeFormat");
  }

  /**
   * 获取图片分辨率的展示模板
   */
  public static getImageResolutionTemplate(): string {
    return this.getConfigValue<string>("imageResolutionTemplate");
  }

  /**
   * 获取状态栏模板
   */
  public static getStatusBarTemplate(): string {
    return this.getConfigValue<string>("folderCalculator.statusBarTemplate");
  }

  /**
   * 获取状态栏自动消失延迟时间（秒）
   */
  public static getStatusBarDismissDelay(): number {
    return this.getConfigValue<number>("folderCalculator.dismissDelay");
  }

  /**
   * 获取文件信息自动显示是否启用
   */
  public static getFileInfoEnabled(): boolean {
    return this.getConfigValue<boolean>("fileInfo.enabled");
  }

  /**
   * 获取终端文件浏览器是否启用
   */
  public static getTerminalExplorerEnabled(): boolean {
    return this.getConfigValue<boolean>("terminalExplorer.enabled");
  }

  /**
   * 获取终端文件浏览器复制路径时是否加双引号
   */
  public static getCopyPathQuote(): boolean {
    return this.getConfigValue<boolean>("terminalExplorer.copyPathQuote");
  }
}
