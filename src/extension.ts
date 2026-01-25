import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { FileDecorationProvider } from "./provider";
import { log } from "./utils/func";
import { CalculateFolderCommand } from "./calculator";

/**
 * 扩展激活入口函数，VSCode 启动扩展/首次使用扩展功能时触发，context 为扩展上下文对象
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(log); // 在一开始就注册日志，保证其他模块可以使用日志功能

    log.info(vscode.l10n.t("Activating Extension: Tree Enhancer"));
    log.info(
        vscode.l10n.t(
            "Extension Version: {0}",
            context.extension.packageJSON.version,
        ),
    );

    const startupDelay = ConfigManager.getStartupDelay() * 1000; // 获取配置中设置的启动延迟秒数，并转换为毫秒（setTimeout 接收毫秒单位）
    log.info(
        vscode.l10n.t(
            "File Decoration Provider will start in {0} seconds",
            ConfigManager.getStartupDelay(),
        ),
    );

    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
    );
    context.subscriptions.push(statusBarItem);

    // 创建文件夹计算命令处理器
    const calculateFolderCommandHandler = new CalculateFolderCommand(
        statusBarItem,
    );

    // 注册文件夹计算命令
    const calculateCommand = vscode.commands.registerCommand(
        "tree-enhancer.calculateFolder",
        (uri?: vscode.Uri) => calculateFolderCommandHandler.execute(uri),
    );

    // 注册 dismiss 命令
    const dismissCommand = vscode.commands.registerCommand(
        "tree-enhancer.dismissStatusBar",
        () => calculateFolderCommandHandler.hideStatusBar(),
    );

    context.subscriptions.push(calculateCommand);
    context.subscriptions.push(dismissCommand);
    context.subscriptions.push(calculateFolderCommandHandler);

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
                    log.info(
                        vscode.l10n.t(
                            "[Config Changed] Refreshing all file decorations",
                        ),
                    );
                    vscode.commands.executeCommand(
                        "tree-enhancer.dismissStatusBar",
                    );
                    log.info(
                        vscode.l10n.t(
                            "[Config Changed] Dismissing status bar item",
                        ),
                    );
                }
            });

        const changeListener = vscode.workspace.onDidSaveTextDocument(
            (document) => {
                fileDecorationProvider.refreshSpecific(document.uri);
                log.info(
                    vscode.l10n.t(
                        "[File Saved] {0} has been saved, corresponding file decorations have been refreshed",
                        document.uri.fsPath,
                    ),
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

    log.info(
        vscode.l10n.t(
            "[Activation Complete] Extension has been successfully activated",
        ),
    );
}

export function deactivate() {}
