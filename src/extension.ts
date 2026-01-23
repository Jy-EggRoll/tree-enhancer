import * as vscode from "vscode"; // 导入 VS Code 的核心 API 模块，提供扩展开发所需的所有核心能力
import { ConfigManager } from "./config"; // 导入自定义的配置管理模块，负责扩展配置的读取、修改检测等核心配置逻辑
import { FileDecorationProvider } from "./provider"; // 导入自定义的文件装饰提供者模块，用于实现资源管理器中文件/文件夹的装饰增强功能

// 定义一个完善的消息输出入口，而不是把消息输出到控制台
export const log = vscode.window.createOutputChannel("Tree Enhancer", {
    log: true,
});

// 扩展激活入口函数，VS Code 启动扩展/首次使用扩展功能时触发，context 为扩展上下文对象
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(log);
    if (ConfigManager.isDebugMode()) {
        // 调用配置管理器方法判断是否开启调试模式，调试模式下输出详细日志
        log.info(`正在激活扩展：Tree Enhancer`);
        log.info(`扩展路径：${context.extensionPath}`);
        log.info(`扩展版本：${context.extension.packageJSON.version}`);
        log.info(`当前配置：`, ConfigManager.getConfig());
    }

    const startupDelay = ConfigManager.getStartupDelay() * 1000; // 获取配置中设置的启动延迟秒数，并转换为毫秒（setTimeout 接收毫秒单位）
    if (ConfigManager.isDebugMode()) {
        // 再次判断调试模式，控制启动延迟相关日志的输出
        log.info(
            `将在 ${ConfigManager.getStartupDelay()} 秒后启动文件装饰提供者`,
        );
    }

    // 延迟启动文件装饰提供者
    const startupTimer = setTimeout(() => {
        // 创建延迟执行的定时器，按配置的延迟时长启动文件装饰核心逻辑
        const fileDecorationProvider = new FileDecorationProvider(); // 实例化文件装饰提供者对象，该对象实现文件/文件夹的装饰逻辑
        const providerDisposable = vscode.window.registerFileDecorationProvider(
            // 向 VS Code 注册文件装饰提供者，使扩展能接管资源管理器的文件装饰逻辑
            fileDecorationProvider, // 传入实例化的文件装饰提供者对象作为注册参数
        );
        context.subscriptions.push(providerDisposable); // 将文件装饰提供者的销毁对象加入上下文订阅，确保扩展卸载时自动销毁该提供者

        const configChangeDisposable =
            vscode.workspace.onDidChangeConfiguration((event) => {
                // 注册 VS Code 配置变更事件监听器，监听所有配置项的修改操作
                // 监听配置变更事件，当用户修改扩展配置时，自动刷新所有文件装饰以应用新设置
                if (ConfigManager.isConfigChanged(event)) {
                    // 调用配置管理器方法，判断变更的配置是否属于当前扩展的配置项
                    // 检查是否是我们扩展的配置发生了变化
                    if (ConfigManager.isDebugMode()) {
                        // 调试模式下输出配置变更相关日志
                        log.info(`[配置变更] 设置已修改，正在更新新设置`);
                        log.info(
                            `[配置变更] 新配置：`,
                            ConfigManager.getConfig(),
                        );
                    }
                    fileDecorationProvider.clearAllStates(); // 清空文件装饰提供者的所有临时状态缓存，避免旧配置状态影响新配置的生效

                    fileDecorationProvider.refreshAll(); // 触发所有文件/文件夹的装饰刷新操作，立即应用新配置的装饰规则
                }
            });
        context.subscriptions.push(configChangeDisposable); // 将配置变更监听器的销毁对象加入上下文订阅，确保扩展卸载时自动移除监听器

        if (ConfigManager.isDebugMode()) {
            // 调试模式下输出延迟启动完成的日志
            // 输出成功注册的调试信息
            log.info(`[延迟启动完成] 文件装饰提供者已注册`);
        }
    }, startupDelay); // 传入之前计算的延迟毫秒数，作为定时器的延迟执行时长

    // 将启动定时器添加到订阅中，确保扩展卸载时能够正确清理
    context.subscriptions.push({
        // 向上下文订阅中添加自定义销毁对象，用于清理启动定时器
        dispose: () => {
            // 定义销毁方法，该方法会在扩展卸载时被调用
            clearTimeout(startupTimer); // 清除启动定时器，避免扩展卸载后定时器仍触发执行
        },
    });

    if (ConfigManager.isDebugMode()) {
        // 调试模式下输出扩展激活完成的日志
        // 输出激活完成的调试信息
        log.info(
            `[激活完成] 扩展已成功激活：Tree Enhancer，将在 ${ConfigManager.getStartupDelay()} 秒后开始工作`,
        );
    }
}

export function deactivate() {} // 没有需要清理的资源，不处理
