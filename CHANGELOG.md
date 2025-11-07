# 更新日志 | Change Log

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

1. 降低了对 VS Code 的版本要求 | Lowered the version requirement for VS Code
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
