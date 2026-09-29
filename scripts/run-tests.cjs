/**
 * 单元测试运行器。
 *
 * 设计动机：被测代码 import 了 "vscode"（扩展宿主外不可用），且源码使用
 * 无扩展名的 TS 导入风格（Node 原生 TS 运行时不支持）。因此：
 *   1. 用 esbuild 把测试入口与源码打成单个 CJS 文件；
 *   2. 打包时把 "vscode" 别名到 src/test/vscodeStub.ts；
 *   3. 用 Node 内置测试运行器执行产物。
 *
 * 全程复用项目已有依赖（esbuild），无需引入额外测试框架，
 * 也无需修改任何产品代码。
 */
const esbuild = require("esbuild");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "src/test/suite/index.ts");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "tree-enhancer-test-"));
const outFile = path.join(outDir, "tests.cjs");

function cleanup() {
    fs.rmSync(outDir, { recursive: true, force: true });
}

async function main() {
    if (!fs.existsSync(entry)) {
        console.error(`未找到测试入口: ${entry}`);
        process.exit(1);
    }

    await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: "cjs",
        platform: "node",
        target: "node20",
        outfile: outFile,
        sourcemap: "inline",
        // vscode 模块在扩展宿主外不存在，打包时替换为测试桩件
        alias: {
            vscode: path.join(root, "src/test/vscodeStub.ts"),
        },
        logLevel: "warning",
    });

    const result = spawnSync(process.execPath, ["--test", outFile], {
        stdio: "inherit",
    });

    cleanup();
    process.exit(result.status ?? 1);
}

main().catch((e) => {
    cleanup();
    console.error(e);
    process.exit(1);
});
