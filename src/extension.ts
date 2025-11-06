import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { FileDecorationProvider } from './provider';

export function activate(context: vscode.ExtensionContext) { // 扩展激活函数，在VS Code启动时或首次使用扩展功能时被调用
    if (ConfigManager.isDebugMode()) { // 检查是否启用了调试模式，决定是否输出启动日志
        console.log(`正在激活扩展: Tree Enhancer`);
        console.log(`[扩展信息] 扩展路径: ${context.extensionPath}`);
        console.log(`[扩展信息] 扩展版本: ${context.extension.packageJSON.version}`);
        console.log(`[配置信息] 当前配置:`, ConfigManager.getConfig());
    }

    const fileDecorationProvider = new FileDecorationProvider(); // 创建文件装饰提供者，负责在资源管理器中显示文件和文件夹的增强信息
    const providerDisposable = vscode.window.registerFileDecorationProvider(fileDecorationProvider);
    context.subscriptions.push(providerDisposable);

    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => { // 监听配置变更事件，当用户修改扩展配置时，自动刷新所有文件装饰以应用新设置
        if (ConfigManager.isConfigChanged(event)) { // 检查是否是我们扩展的配置发生了变化
            if (ConfigManager.isDebugMode()) {
                console.log(`[配置变更] 设置已修改，正在更新新设置...`);
                console.log(`[配置变更] 新配置:`, ConfigManager.getConfig());
            }
            fileDecorationProvider.clearAllStates(); // 清除文件装饰提供者的所有临时状态，这样下次悬浮时会使用新的配置重新计算
            fileDecorationProvider.refreshAll(); // 触发所有文件装饰的刷新，undefined参数表示刷新所有文件
        }
    });
    context.subscriptions.push(configChangeDisposable);

    if (ConfigManager.isDebugMode()) { // 输出成功注册的调试信息
        console.log(`[激活完成] 扩展已成功激活: Tree Enhancer`);
        console.log(`[激活完成] 已注册 ${context.subscriptions.length} 个订阅`);
    }
}

export function deactivate() { // 扩展停用函数，在扩展被卸载或VS Code关闭时调用
    // 目前没有需要手动清理的资源，如果将来添加了需要手动清理的资源（如定时器、网络连接等），在这里处理
}
