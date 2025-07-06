import * as vscode from 'vscode'; // 把所有 API 内容导入到 vscode 命名空间下
import * as fs from 'fs'; // 导入 Node.js 的文件系统模块
import * as path from 'path'; // 导入路径处理模块

/**
 * 格式化文件大小为人类可读的字符串
 * 
 * 支持两种计算基底：
 * - 1000：十进制基底，使用 KB、MB、GB、TB 等单位（符合国际标准SI）
 * - 1024：二进制基底，使用 KiB、MiB、GiB、TiB 等单位（传统计算机标准）
 * 
 * @param bytes 文件大小（字节数）
 * @returns 格式化后的文件大小字符串，如 "1.54 MB" 或 "1.46 MiB"
 */
function formatFileSize(bytes: number): string {
    // 如果文件大小为0，直接返回
    if (bytes === 0) return '0 B';

    // 从用户配置中读取计算基底，默认为1000（十进制）
    const base = vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<number>('fileSizeBase', 1000);

    // 根据基底选择对应的单位数组
    let sizes: string[];
    if (base === 1024) {
        // 二进制单位：使用 KiB、MiB、GiB 等（1024进制）
        sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    } else {
        // 十进制单位：使用 KB、MB、GB 等（1000进制）
        sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    }

    // 计算单位索引：确定应该使用哪个单位
    // Math.log(bytes) / Math.log(base) 计算以base为底的对数
    // Math.floor() 向下取整，得到单位级别
    const i = Math.floor(Math.log(bytes) / Math.log(base));

    // 确保索引不超出数组范围
    const unitIndex = Math.min(i, sizes.length - 1);

    // 计算最终数值：将字节数除以对应的基底的幂次
    const value = bytes / Math.pow(base, unitIndex);

    // 格式化数值：保留2位小数，并拼接单位
    // parseFloat() 用于去除不必要的尾随零
    return parseFloat(value.toFixed(2)) + ' ' + sizes[unitIndex];
}

/**
 * 计算文件夹大小的异步函数
 * @param dirPath 文件夹路径
 * @param signal AbortSignal 用于取消计算
 * @returns Promise<{ size: number; fileCount: number; folderCount: number }> 返回大小、文件数、文件夹数
 */
async function calculateDirectoryInfo(dirPath: string, signal?: AbortSignal): Promise<{ size: number; fileCount: number; folderCount: number }> {
    // 检查是否被取消
    if (signal?.aborted) {
        throw new Error('Calculation aborted');
    }

    try {
        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        // 读取目录内容，包含文件类型信息
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

        // 遍历目录中的每个项目
        for (const item of items) {
            // 再次检查是否被取消
            if (signal?.aborted) {
                throw new Error('Calculation aborted');
            }

            const itemPath = path.join(dirPath, item.name);
            try {
                if (item.isDirectory()) {
                    // 如果是文件夹，递归计算并累加结果
                    folderCount++;
                    const subResult = await calculateDirectoryInfo(itemPath, signal);
                    totalSize += subResult.size;
                    fileCount += subResult.fileCount;
                    folderCount += subResult.folderCount;
                } else if (item.isFile()) {
                    // 如果是文件，获取文件大小并累加
                    fileCount++;
                    const stats = await fs.promises.stat(itemPath);
                    totalSize += stats.size;
                }
            } catch (error) {
                // 忽略无法访问的文件/目录（如权限问题），但记录警告
                // 注意：如果是计算被取消，不要记录为"无法访问"，因为这是正常的取消操作
                if ((error as Error).message !== 'Calculation aborted') {
                    console.warn(`无法访问: ${itemPath}`, error);
                }
                // 如果是计算被取消，直接重新抛出，让上层处理
                if ((error as Error).message === 'Calculation aborted') {
                    throw error;
                }
            }
        }

        return { size: totalSize, fileCount, folderCount };
    } catch (error) {
        // 如果是取消操作，重新抛出错误
        if (signal?.aborted || (error as Error).message === 'Calculation aborted') {
            throw error;
        }
        console.error(`计算目录信息失败: ${dirPath}`, error);
        return { size: 0, fileCount: 0, folderCount: 0 };
    }
}

function formatDate(date: Date): string {
    // 格式化为中文友好的日期时间格式
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function activate(context: vscode.ExtensionContext) {
    // 检查是否启用了调试模式
    const isDebugMode = vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<boolean>('debugMode', false);

    if (isDebugMode) {
        console.log('Congratulations, your extension "eggroll-tree-enhancer" is now active!');
    }

    // 直接启动，不延迟等待
    const fileDecorationProvider = new FileDecorationProvider();
    const disposable = vscode.window.registerFileDecorationProvider(fileDecorationProvider);
    context.subscriptions.push(disposable);

    // 监听配置变更事件
    // 当用户修改扩展配置时，自动刷新所有文件装饰
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => {
        // 检查是否是我们扩展的配置发生了变化
        if (event.affectsConfiguration('eggroll-tree-enhancer')) {
            const newDebugMode = vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<boolean>('debugMode', false);
            if (newDebugMode) {
                console.log('扩展配置已更新，正在应用新设置');
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

    if (isDebugMode) {
        console.log('FileDecorationProvider registered with configuration change monitoring');
    }
}

/**
 * 文件装饰提供者类
 * 负责为资源管理器中的文件和文件夹提供悬浮提示信息
 * 
 * 设计原则：
 * 1. 不使用缓存机制，确保信息实时性
 * 2. 每次悬浮都重新计算，保证准确性
 * 3. 异步计算避免阻塞界面
 * 4. 超时控制防止长时间等待
 */
class FileDecorationProvider implements vscode.FileDecorationProvider {
    // 文件装饰变化事件发射器
    // 当文件装饰需要更新时，触发此事件通知 VS Code 重新获取装饰信息
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    // 正在计算中的目录集合，避免对同一目录重复启动计算
    // 使用文件路径作为键，确保每个目录同时只有一个计算任务
    private _calculatingDirs = new Set<string>();

    // 存储取消控制器映射表，用于超时取消计算
    // 键为文件路径，值为对应的 AbortController 实例
    private _abortControllers = new Map<string, AbortController>();

    // 临时存储最近一次计算完成的结果，仅在当前悬浮会话中有效
    // 这不是缓存！每次用户重新悬浮时都会清除并重新计算
    // 目的是在计算完成到界面刷新的短暂时间内能够显示结果
    private _temporaryResults = new Map<string, {
        size: number;
        fileCount: number;
        folderCount: number;
        isTimeout: boolean; // 标记是否为超时结果
    }>();

    // 最大计算时间（毫秒），从用户配置中读取，默认 5000ms (5秒)
    // 如果计算超过此时间，将自动取消并显示超时提示
    // 注意：我们不再缓存这个值，而是每次都动态读取，以支持实时配置变更
    private get MAX_CALCULATION_TIME(): number {
        return vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<number>('maxCalculationTime', 5000);
    }

    /**
     * 判断路径是否应该被处理
     * 过滤掉 VS Code 内部文件、系统文件等不相关的路径
     */
    private shouldProcessPath(fsPath: string): boolean {
        const normalizedPath = fsPath.toLowerCase().replace(/\\/g, '/');

        // 基本过滤条件
        if (!fsPath || fsPath.trim() === '') {
            return false;
        }

        // 只处理工作区内的文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const isInWorkspace = workspaceFolders.some(folder => {
                const workspacePath = folder.uri.fsPath.toLowerCase().replace(/\\/g, '/');
                return normalizedPath.startsWith(workspacePath);
            });

            // 如果有工作区但文件不在工作区内，跳过
            if (!isInWorkspace) {
                return false;
            }
        }

        return true;
    }

    /**
     * 提供文件装饰信息的核心方法
     * 
     * 此方法在用户悬浮鼠标到资源管理器中的文件或文件夹时被调用
     * 
     * @param uri 文件或文件夹的URI，包含完整路径信息
     * @returns 文件装饰对象，包含工具提示等信息；如果出错则返回 undefined
     * 
     * 工作流程：
     * 1. 获取文件/文件夹的基本统计信息（大小、修改时间等）
     * 2. 对于普通文件：直接显示大小和修改时间
     * 3. 对于文件夹：检查是否正在计算，如果没有则启动新的计算任务
     * 4. 计算过程中显示"正在计算..."，完成后刷新显示实际结果
     */
    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
        try {
            // 严格过滤不相关的路径
            if (!this.shouldProcessPath(uri.fsPath)) {
                return undefined;
            }

            // 获取文件或文件夹的基本统计信息
            // 包括文件大小、修改时间、是否为目录等
            const stats = await fs.promises.stat(uri.fsPath);
            const fileName = path.basename(uri.fsPath); // 提取文件名（不含路径）
            const modifiedTime = formatDate(stats.mtime); // 格式化修改时间

            let tooltip: string;

            if (stats.isDirectory()) {
                // 处理文件夹情况
                const cacheKey = uri.fsPath; // 使用完整路径作为唯一标识

                // 首先检查是否有临时计算结果
                const tempResult = this._temporaryResults.get(cacheKey);
                if (tempResult) {
                    // 有临时结果，显示完整信息
                    if (tempResult.isTimeout) {
                        // 这是超时的结果
                        tooltip = `文件夹：${fileName} | 文件夹过于复杂，请在设置中增加计算时间限制或采用其他工具获取信息 | 修改于：${modifiedTime}`;
                    } else {
                        // 这是正常的计算结果
                        const formattedSize = formatFileSize(tempResult.size);
                        tooltip = `文件夹：${fileName} | 大小：${formattedSize} | 子文件总数：${tempResult.fileCount} | 子文件夹总数：${tempResult.folderCount} | 修改于：${modifiedTime}`;
                    }

                    // 清除临时结果，确保下次悬浮时重新计算
                    // 这保证了信息的实时性
                    this._temporaryResults.delete(cacheKey);

                } else if (this._calculatingDirs.has(cacheKey)) {
                    // 如果当前文件夹正在计算中，显示计算状态
                    // 避免重复启动计算任务，防止资源浪费
                    tooltip = `文件夹：${fileName} | 正在计算 | 修改于：${modifiedTime}`;

                } else {
                    // 文件夹当前没有在计算中，也没有临时结果
                    // 启动新的计算任务

                    try {
                        // 尝试快速获取文件夹的直接子项数量（不递归）
                        // 这个操作通常很快，可以给用户一个初步的信息
                        const items = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
                        let directFileCount = 0;
                        let directFolderCount = 0;

                        for (const item of items) {
                            if (item.isFile()) {
                                directFileCount++;
                            } else if (item.isDirectory()) {
                                directFolderCount++;
                            }
                        }

                        // 显示基本信息，并启动详细计算
                        tooltip = `文件夹：${fileName} | 计算中（预估 ${directFileCount}+ 文件，${directFolderCount}+ 文件夹） | 修改于：${modifiedTime}`;

                    } catch (quickError) {
                        // 如果连快速读取都失败，显示简单的计算中状态
                        tooltip = `文件夹：${fileName} | 正在计算 | 修改于：${modifiedTime}`;
                    }

                    // 标记为计算中并启动详细计算
                    this._calculatingDirs.add(cacheKey);

                    // 异步启动完整的递归计算任务
                    this.calculateAndUpdateDirectoryInfo(uri)
                        .then(() => {
                            // 计算成功完成，触发界面刷新
                            // VS Code 会重新调用 provideFileDecoration 方法
                            this._onDidChangeFileDecorations.fire(uri);
                        })
                        .catch((error) => {
                            // 计算出错或超时，清理状态并刷新界面
                            // 只有在非超时错误时才记录详细错误信息
                            if ((error as Error).message !== 'Calculation aborted') {
                                console.error('计算文件夹信息时出错:', error);
                            }
                            // 清理状态（超时和其他错误都需要清理）
                            this._calculatingDirs.delete(cacheKey);
                            this._abortControllers.delete(cacheKey);
                            // 即使出错也要刷新，显示错误状态或恢复到默认状态
                            this._onDidChangeFileDecorations.fire(uri);
                        });

                    // 立即返回当前状态，不等待计算完成
                    return { tooltip };
                }
            } else {
                // 处理普通文件情况
                // 文件大小可以直接从统计信息中获取，无需复杂计算
                const size = stats.size;
                const formattedSize = formatFileSize(size);
                tooltip = `文件：${fileName} | 大小：${formattedSize} | 修改于：${modifiedTime}`;
            }

            return { tooltip };
        } catch (error) {
            // 文件访问出错（如权限问题、文件不存在等）
            // 由于我们已经严格过滤了路径，这里的错误通常是真正的问题

            const errorCode = (error as any).code;

            // 只记录真正重要的错误
            if (errorCode === 'ENOENT') {
                // 文件不存在错误 - 只记录用户文件的情况
                const fsPath = uri.fsPath;
                if (fsPath && fsPath.length > 20) { // 只记录较长路径的错误，通常是用户文件
                    console.warn(`文件可能已被删除: ${fsPath}`);
                }
            } else if (errorCode === 'EACCES') {
                // 权限问题
                console.warn(`无权限访问文件: ${uri.fsPath}`);
            } else {
                // 其他类型的错误可能更重要
                console.warn('文件访问错误:', uri.fsPath, errorCode || error);
            }

            // 返回 undefined 表示不显示装饰，让 VS Code 使用默认行为
            return undefined;
        }
    }

    /**
     * 计算并更新文件夹信息的私有方法
     * 
     * 此方法负责异步计算文件夹的详细信息，包括：
     * - 总大小（递归计算所有子文件和子文件夹）
     * - 文件数量（递归计算所有层级的文件）
     * - 文件夹数量（递归计算所有层级的子文件夹）
     * 
     * @param uri 文件夹的URI
     * @returns Promise<void> 无返回值，但会更新内部状态并触发界面刷新
     * 
     * 工作流程：
     * 1. 创建超时控制器，防止计算时间过长
     * 2. 调用递归计算函数获取文件夹详细信息
     * 3. 如果计算成功，清理计算状态并触发界面刷新
     * 4. 如果计算超时，清理状态并标记为超时（下次悬浮时显示超时信息）
     * 5. 无论成功失败都要清理相关状态，避免内存泄漏
     */
    private async calculateAndUpdateDirectoryInfo(uri: vscode.Uri): Promise<void> {
        const cacheKey = uri.fsPath; // 使用完整路径作为唯一标识

        try {
            // 创建取消控制器，用于实现超时功能
            // AbortController 是现代 JavaScript 的标准取消机制
            const abortController = new AbortController();
            this._abortControllers.set(cacheKey, abortController);

            // 设置超时定时器
            // 如果计算时间超过配置的最大时间，自动取消计算
            const timeoutId = setTimeout(() => {
                const isDebugMode = vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<boolean>('debugMode', false);
                if (isDebugMode) {
                    console.log(`文件夹计算超时，已取消: ${uri.fsPath} (${this.MAX_CALCULATION_TIME}ms)`);
                }
                abortController.abort(); // 发送取消信号
            }, this.MAX_CALCULATION_TIME);

            // 开始计算文件夹信息
            // 这是核心计算逻辑，可能耗时较长
            const result = await calculateDirectoryInfo(uri.fsPath, abortController.signal);

            // 计算成功完成，清除超时定时器
            clearTimeout(timeoutId);

            // 只在调试模式下输出详细日志
            const isDebugMode = vscode.workspace.getConfiguration('eggroll-tree-enhancer').get<boolean>('debugMode', false);
            if (isDebugMode) {
                console.log(`文件夹计算完成: ${uri.fsPath}, 大小: ${result.size}, 文件: ${result.fileCount}, 文件夹: ${result.folderCount}`);
            }

            // 存储临时结果，供下一次 provideFileDecoration 调用时使用
            // 注意：这不是持久缓存，只是为了在计算完成后能立即显示结果
            this._temporaryResults.set(cacheKey, {
                size: result.size,
                fileCount: result.fileCount,
                folderCount: result.folderCount,
                isTimeout: false
            });

            // 标记该文件夹计算已完成
            // 下次调用 provideFileDecoration 时会显示实际结果而不是"正在计算..."
            this._calculatingDirs.delete(cacheKey);
            this._abortControllers.delete(cacheKey);

        } catch (error) {
            // 处理计算过程中的各种错误情况

            if ((error as Error).message === 'Calculation aborted') {
                // 这是超时取消的情况，不需要记录错误日志
                // 因为这是正常的超时行为，不是真正的错误

                // 存储超时结果的临时标记
                this._temporaryResults.set(cacheKey, {
                    size: 0,
                    fileCount: 0,
                    folderCount: 0,
                    isTimeout: true
                });

                // 清理计算状态
                this._calculatingDirs.delete(cacheKey);
                this._abortControllers.delete(cacheKey);
            } else {
                // 其他类型的错误（如权限问题、IO错误等）
                console.error(`计算文件夹信息时发生错误: ${uri.fsPath}`, error);

                // 清理计算状态，不存储错误结果
                this._calculatingDirs.delete(cacheKey);
                this._abortControllers.delete(cacheKey);
            }

            // 重新抛出错误，让调用方知道计算失败
            // 调用方会据此清理状态并刷新界面
            throw error;
        }
    }

    /**
     * 清除所有内部状态
     * 
     * 当配置发生变更时调用，清除所有缓存和计算状态
     * 确保下次访问时使用新的配置重新计算
     */
    clearAllStates(): void {
        // 清除所有正在计算的标记
        this._calculatingDirs.clear();

        // 取消所有正在进行的计算任务
        for (const [path, controller] of this._abortControllers) {
            controller.abort();
        }
        this._abortControllers.clear();

        // 清除所有临时结果
        this._temporaryResults.clear();
    }

    /**
     * 刷新所有文件装饰
     * 
     * 触发 VS Code 重新获取所有文件的装饰信息
     * 这会导致 provideFileDecoration 方法被重新调用
     */
    refreshAll(): void {
        // 触发所有文件装饰的刷新
        // undefined 参数表示刷新所有文件，而不是特定文件
        this._onDidChangeFileDecorations.fire(undefined);
    }
}

export function deactivate() { }
