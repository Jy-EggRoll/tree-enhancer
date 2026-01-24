import * as vscode from "vscode"; // 导入 VSCode 的核心 API 模块，提供扩展开发所需的所有核心能力
import { ConfigManager } from "./config"; // 导入自定义的配置管理模块，负责扩展配置的读取、修改检测等核心配置逻辑
import { FileDecorationProvider } from "./provider"; // 导入自定义的文件装饰提供者模块，用于实现资源管理器中文件/文件夹的装饰增强功能

// 可以在“输出”面板中查看 Tree Enhancer 的完整日志，方便调试和问题排查
export const log = vscode.window.createOutputChannel("Tree Enhancer", {
    log: true,
});

// 扩展激活入口函数，VSCode 启动扩展/首次使用扩展功能时触发，context 为扩展上下文对象
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(log); // 在一开始就注册日志，保证其他模块可以使用日志功能

    log.info(`正在激活扩展：Tree Enhancer`);
    log.info(`扩展版本：${context.extension.packageJSON.version}`);

    const startupDelay = ConfigManager.getStartupDelay() * 1000; // 获取配置中设置的启动延迟秒数，并转换为毫秒（setTimeout 接收毫秒单位）
    log.info(`将在 ${ConfigManager.getStartupDelay()} 秒后启动文件装饰提供者`);

    // 延迟启动文件装饰提供者
    const startupTimer = setTimeout(() => {
        const fileDecorationProvider = new FileDecorationProvider(); // 实例化文件装饰提供者对象
        const providerDisposable = vscode.window.registerFileDecorationProvider(
            // 向 VSCode 注册文件装饰提供者，使扩展能接管资源管理器的文件装饰逻辑
            fileDecorationProvider, // 传入实例化的文件装饰提供者对象作为注册参数
        );

        // 注册 VSCode 配置变更事件监听器，监听所有配置项的修改操作，当用户修改扩展配置时，自动刷新所有文件装饰以应用新设置
        const configChangeDisposable =
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (ConfigManager.isConfigChanged(event)) {
                    fileDecorationProvider.refreshAll(); // 触发所有文件/文件夹的装饰刷新操作，立即应用新配置的装饰规则
                    log.info(`[配置变更] 设置已修改，已经刷新所有文件装饰`);
                }
            });

        // 在文档保存时刷新对应文件装饰，而非刷新所有，这可以确保在 VSCode 中编辑过的文件保存后，装饰信息能及时更新（主要用于确保修改时间正确）
        const changeListener = vscode.workspace.onDidSaveTextDocument(
            (document) => {
                fileDecorationProvider.refreshSpecific(document.uri);
                log.info(
                    `[文件保存] ${document.uri.fsPath} 已保存，已经刷新对应文件装饰`,
                );
            },
        );

        // 将各个可释放资源添加到扩展上下文的订阅中，确保扩展卸载时能够正确清理
        context.subscriptions.push(configChangeDisposable);
        context.subscriptions.push(changeListener);
        context.subscriptions.push(providerDisposable);
    }, startupDelay);

    // 将启动定时器添加到订阅中，确保扩展卸载时能够正确清理
    context.subscriptions.push({
        // 向上下文订阅中添加自定义销毁对象，用于清理启动定时器
        dispose: () => {
            // 定义销毁方法，该方法会在扩展卸载时被调用
            clearTimeout(startupTimer); // 清除启动定时器，避免扩展卸载后定时器仍触发执行
        },
    });

    log.info(`[激活完成] 扩展已成功激活`);
}

export function deactivate() {}
