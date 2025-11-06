const esbuild = require('esbuild'); // 引入 esbuild 构建工具

const production = process.argv.includes('--production'); // 检查命令行参数，决定是否为生产模式

esbuild.build({
    entryPoints: ['src/extension.ts'], // 入口文件，VS Code 扩展主入口
    bundle: true, // 打包所有依赖到一个文件，便于分发
    format: 'cjs', // 输出为 CommonJS 格式，VS Code 扩展要求
    minify: production, // 生产模式下压缩代码，减小体积
    sourcemap: !production, // 开发模式下生成 sourcemap，便于调试
    sourcesContent: false, // 不嵌入源码内容，减小 sourcemap 体积
    platform: 'node', // 目标平台为 Node.js
    outfile: 'dist/extension.js', // 输出文件路径
    external: ['vscode'], // 不打包 VS Code 的运行时依赖
    logLevel: 'warning', // 只输出警告及以上日志，避免干扰
}).then(() => {
    console.log(`[esbuild] Build finished (${production ? 'production' : 'development'} mode)`); // 打包成功提示
}).catch(e => {
    console.error('[esbuild] Build failed:', e); // 打包失败，输出错误
    process.exit(1); // 退出进程，返回错误码
});
