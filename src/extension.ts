import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { FileDecorationProvider } from './provider';

export function activate(context: vscode.ExtensionContext) { // 扩展激活函数，在 VS Code 启动时或首次使用扩展功能时被调用
    if (ConfigManager.isDebugMode()) { // 检查是否启用了调试模式，决定是否输出启动日志
        console.log(`正在激活扩展: Tree Enhancer`);
        console.log(`[扩展信息] 扩展路径: ${context.extensionPath}`);
        console.log(`[扩展信息] 扩展版本: ${context.extension.packageJSON.version}`);
        console.log(`[配置信息] 当前配置:`, ConfigManager.getConfig());
    }

    const startupDelay = ConfigManager.getStartupDelay() * 1000; // 获取启动延迟配置（转换为毫秒）
    if (ConfigManager.isDebugMode()) {
        console.log(`[启动延迟] 将在 ${ConfigManager.getStartupDelay()} 秒后启动文件装饰提供者`);
    }

    // 延迟启动文件装饰提供者
    const startupTimer = setTimeout(() => {
        const fileDecorationProvider = new FileDecorationProvider(); // 创建文件装饰提供者，负责在资源管理器中显示文件和文件夹的增强信息
        const providerDisposable = vscode.window.registerFileDecorationProvider(fileDecorationProvider);
        context.subscriptions.push(providerDisposable);

        // 启动文件系统监视器
        fileDecorationProvider.startFileSystemWatcher();

        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => { // 监听配置变更事件，当用户修改扩展配置时，自动刷新所有文件装饰以应用新设置
            if (ConfigManager.isConfigChanged(event)) { // 检查是否是我们扩展的配置发生了变化
                if (ConfigManager.isDebugMode()) {
                    console.log(`[配置变更] 设置已修改，正在更新新设置...`);
                    console.log(`[配置变更] 新配置:`, ConfigManager.getConfig());
                }
                fileDecorationProvider.clearAllStates(); // 清除文件装饰提供者的所有临时状态，这样下次装饰请求时会使用新的配置重新计算

                // 重启文件系统监视器以应用新配置
                fileDecorationProvider.stopFileSystemWatcher();
                fileDecorationProvider.startFileSystemWatcher();

                fileDecorationProvider.refreshAll(); // 触发所有文件装饰的刷新
            }
        });
        context.subscriptions.push(configChangeDisposable);

        if (ConfigManager.isDebugMode()) { // 输出成功注册的调试信息
            console.log(`[延迟启动完成] 文件装饰提供者已注册，总订阅数: ${context.subscriptions.length}`);
        }
    }, startupDelay);

    // 将启动定时器添加到订阅中，确保扩展卸载时能够正确清理
    context.subscriptions.push({
        dispose: () => {
            clearTimeout(startupTimer);
        }
    });

    if (ConfigManager.isDebugMode()) { // 输出激活完成的调试信息
        console.log(`[激活完成] 扩展已成功激活: Tree Enhancer，将在 ${ConfigManager.getStartupDelay()} 秒后开始工作`);
    }
}

export function deactivate() { // 扩展停用函数，在扩展被卸载或 VS Code 关闭时调用
    // 目前没有需要手动清理的资源，如果将来添加了需要手动清理的资源（如定时器、网络连接等），在这里处理
}