import * as vscode from 'vscode'; // 把所有 API 内容导入到 vscode 命名空间下
import * as fs from 'fs'; // 导入 Node.js 的文件系统模块

function formatFileSize(bytes: number): string {
    // 把大小格式化为适当形式，接收一个数字，返回一个字符串
    if (bytes === 0) return '0 B';

    // const BinaryBase = 1024;
    const DecimalBase = 1000; // 使用 1000 作为基数，日后拓展二进制应该使用 MiB 等单位形式
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(DecimalBase)); // 确定单位索引
    return parseFloat((bytes / Math.pow(DecimalBase, i)).toFixed(2)) + ' ' + sizes[i]; // 返回形如 1.54 MB 的字符串
}

function formatDate(date: Date): string {
    return date.toDateString();
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "eggroll-tree-enhancer" is now active!');
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position) {
            try {
                const filePath = document.uri.fsPath;
                const stats = fs.statSync(filePath);
                const size = formatFileSize(stats.size);
                const modifiedTime = formatDate(stats.mtime);
                const type = stats.isDirectory() ? '文件夹' : '文件';
                const hoverText = `${type}\n${size}\n修改于 ${modifiedTime}`;
                return new vscode.Hover(hoverText);
            } catch (error) {
                return null;
            }
        }
    })
}

export function deactivate() { }
