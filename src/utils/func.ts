import * as vscode from "vscode";

// 可以在“输出”面板中查看 Tree Enhancer 的完整日志，方便调试和问题排查
export const log = vscode.window.createOutputChannel("Tree Enhancer", {
    log: true,
});
