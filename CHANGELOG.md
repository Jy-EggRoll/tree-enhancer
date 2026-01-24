# 更新日志 | Change Log

## 1.6.0

**破坏性更新**：请务必阅读此版本的更新说明 | **Breaking Change**: Please read the release notes for this version carefully

- **🗑️ 彻底移除了文件夹大小的计算与显示功能，因为文件夹的递归计算性能是不可控的，容易导致严重的性能问题 | Completely removed the folder size calculation and display feature due to uncontrollable performance issues caused by recursive folder size calculation**
    - 该功能会在未来版本中以其他形式重新设计和实现 | This feature will be redesigned and re-implemented in future versions in other forms
- 🗑️ 移除了相关无用的设置 | Removed related useless settings
- ✨ 移除了调试模式，注册了“输出”通道，用户可以直观地调整日志级别，并看到扩展工作的全流程 | Removed debug mode, registered an "Output" channel where users can intuitively adjust log levels and see the full workflow of the extension
- ✨ 引入 l10n 国际化支持，扩展的所有文本均支持多语言显示 | Introduced l10n internationalization support, all texts of the extension support multi-language display
- 🐛 调整字符串模板修改的方式，修复了直接编辑导致转义字符被破坏的问题（<https://github.com/Jy-EggRoll/tree-enhancer/issues/1>） | Changed the way string templates are modified to fix the issue where direct editing caused escape characters to be corrupted (<https://github.com/Jy-EggRoll/tree-enhancer/issues/1>)
- ✨ 极大幅度的性能优化，扩展启动更快，几乎不可能造成任何性能问题，做到了真正的按需加载 | Significant performance optimizations, faster extension startup, almost impossible to cause any performance issues, achieving true on-demand loading
- ✨ 大幅优化代码规范度和结构，提高可维护性 | Greatly improved code standardization and structure for better maintainability
- 🗑️ 移除上一版本的轮询机制，现在扩展只识别在 VSCode 中保存的文件变更（高性能） | Removed the polling mechanism from the previous version, now the extension only recognizes file changes saved within VSCode (very high performance)

## 1.5.0

引入全新的文件监视器，去除原来的轮询机制 | Introduced a brand-new file watcher, removing the previous polling mechanism

目前解决了大部分的文件信息缓存不同步问题 | Currently resolved most issues related to file information cache desynchronization

文件夹信息尚未解决 | Folder information issues are yet to be resolved

## 1.4.1

增加启动延迟，提升插件性能 | Added startup delay to improve plugin performance

## 1.4.0

1. 大幅优化扩展的性能 | Significant performance optimizations
    - 引入智能刷新机制，定期刷新文件装饰，避免频繁全量刷新 | Introduced intelligent refresh mechanism to periodically refresh file decorations, avoiding frequent full refreshes
    - 优化缓存机制，减少重复计算 | Optimized caching mechanism to reduce redundant calculations
2. 新增大文件标识功能，用类似 Git 扩展的样式标识大文件 | Added large file identification feature, marking large files with a style similar to Git extension

![大文件标注](assets/images/大文件标注.png)

3. 修复大量问题 | Fixed numerous issues
4. 优化代码结构，提高可维护性 | Improved code structure for better maintainability
5. 移除大量不必要的依赖 | Removed numerous unnecessary dependencies
6. 增设配置项 startupDelay，允许用户延迟扩展的激活时间 | Added configuration option startupDelay to allow users to delay extension activation time
7. 增设配置项 refreshInterval，允许用户自定义定期刷新的时间间隔 | Added configuration option refreshInterval to allow users to customize the interval for periodic refreshes
8. 增设配置项 largeFileThresholdMB，允许用户自定义大文件的大小阈值 | Added configuration option largeFileThresholdMB to allow users to customize the size threshold for large files
9. 修复了之前的版本提示信息不更新的问题 | Fixed the issue of outdated version prompt messages in previous versions

## 1.3.3

精简扩展大小，为下一版重大功能更新做准备 | Reduced extension size in preparation for the next major feature update

## 1.3.2

迁移到 pnpm，测试自动发布，优化仓库结构 | Migrate to pnpm, test automatic publishing, optimize repository structure

## 1.3.1

更换打包工具，紧急修复上一版本的错误 | Replace the packaging tool and urgently fix the errors in the previous version

## 1.3.0

新增图片分辨率显示功能 | Added image resolution display feature

- 支持显示图片文件的宽度和高度信息 | Support displaying width and height information for image files
- 支持常见图片格式：jpg, jpeg, png, gif, webp, svg | Support common image formats: jpg, jpeg, png, gif, webp, svg
- 可自定义分辨率显示模板 | Customizable resolution display template
- 仅对图片文件启用分辨率检测，不影响其他文件性能 | Resolution detection is only enabled for image files, does not affect performance of other files

## 1.2.0

更加友好的本地化支持选项 | Friendly nls settings

## 1.1.2

1. 修改了显示字符串默认模板 | Modified the default template for display strings
2. 完善 README 的展示效果 | Improved the display effects in the README
3. 排除了 node_modules，显著地降低了扩展的大小 | Excluded node_modules, significantly reducing the size of the extension

## 1.1.1

1. 降低了对 VSCode 的版本要求 | Lowered the version requirement for VSCode
2. 增加了本地化功能 | Added localization support

## 1.1.0

1. 彻底重构了代码结构，切分为模块 | Completely refactored code structure into modules
2. 新增字符串模板自定义功能，以支持几乎任何语言 | Added string template customization to support almost any language

## 1.0.2

- 完善了部分文档信息 | Improved some documentation details

## 1.0.1

- 添加了插件图标 | Added extension icon

## 1.0.0

- 功能基本完成，发布版 | Initial release with basic functionality
