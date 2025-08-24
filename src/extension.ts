/**
 * Tree Enhancer 扩展主入口文件
 * 提供资源管理器文件和文件夹的悬浮增强信息
 * 
 * 功能特性：
 * - 文件大小显示（支持多种计算基底）
 * - 文件夹递归大小计算
 * - 文件/文件夹数量统计
 * - 修改时间显示
 * - 国际化模板支持
 * - 配置实时变更响应
 */

import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { FileDecorationProvider } from './provider';

/**
 * 扩展激活函数
 * 
 * 在 VS Code 启动时或首次使用扩展功能时被调用
 * 负责初始化扩展的核心功能和事件监听
 * 
 * @param context 扩展上下文，用于管理扩展的生命周期
 */
export function activate(context: vscode.ExtensionContext) {
    // 检查是否启用了调试模式，决定是否输出启动日志
    if (ConfigManager.isDebugMode()) {
        console.log('Tree Enhancer is ACTIVE!');
    }

    // 创建并注册文件装饰提供者
    // 这是扩展的核心功能，负责在资源管理器中显示文件和文件夹的增强信息
    const fileDecorationProvider = new FileDecorationProvider();
    const providerDisposable = vscode.window.registerFileDecorationProvider(fileDecorationProvider);
    context.subscriptions.push(providerDisposable);

    // 监听配置变更事件
    // 当用户修改扩展配置时，自动刷新所有文件装饰以应用新设置
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => {
        // 检查是否是我们扩展的配置发生了变化
        if (ConfigManager.isConfigChanged(event)) {
            if (ConfigManager.isDebugMode()) {
                console.log('Settings modified, updating new settings...');
            }

            // 清除文件装饰提供者的所有临时状态
            // 这样下次悬浮时会使用新的配置重新计算
            fileDecorationProvider.clearAllStates();

            // 触发所有文件装饰的刷新
            // undefined 参数表示刷新所有文件
            fileDecorationProvider.refreshAll();
        }
    });
    context.subscriptions.push(configChangeDisposable);

    // 输出成功注册的调试信息
    if (ConfigManager.isDebugMode()) {
        console.log('Succeeded');
    }
}

/**
 * 扩展停用函数
 * 
 * 在扩展被卸载或 VS Code 关闭时调用
 * 用于清理资源和执行必要的清理工作
 * 
 * 注意：VS Code 会自动处理大部分清理工作，包括事件监听器的注销
 * 因此这里通常不需要手动清理，除非有特殊的资源需要释放
 */
export function deactivate() {
    // 目前没有需要手动清理的资源
    // 如果将来添加了需要手动清理的资源（如定时器、网络连接等），在这里处理
}
