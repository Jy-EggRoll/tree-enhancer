# 文件树增强

一个轻量级、高性能的 VS Code 资源管理器树增强扩展，在悬浮时显示文件和文件夹的详细信息，如大小、子文件数、子文件夹数等。

## 功能演示

- 文件大小显示：悬浮在文件上时，显示文件的大小，支持所有文件类型。
  ![alt text](assets/gifs/PixPin_2025-11-07_00-18-03.gif)

- 文件夹详情显示：悬浮在文件夹上时，显示文件夹的总大小、包含的文件数量和子文件夹数量。
  ![alt text](assets/gifs/PixPin_2025-11-07_00-19-32.gif)

对于媒体文件做了特殊优化，可以读取其元信息，如图片的分辨率（当前版本只支持图片，日后会逐渐加入更多媒体文件类型）。

对于大文件，会用类似 Git 扩展的样式进行标识，方便用户识别，和 Git 集成性好。

![大文件](assets/images/大文件.png)

![function_show](assets/gifs/功能演示.gif)

## 已知问题

- 当存在某些提示时，例如文件夹下的代码中有错误，这会导致文件夹提示“包含强调项”。该提示有很高的优先级，会导致其他提示失效果。目前尚无法解决该问题。“包含强调项”被解决后，本扩展的提示将恢复正常。

![known_issues](assets/gifs/已知_bug.gif)

## 主要功能

### 智能文件夹信息

- **递归计算大小**：自动统计文件夹内所有文件的总大小
- **文件统计**：显示文件夹内的文件数量和子文件夹数量
- **实时计算**：每次悬浮都重新计算，确保信息准确性
- **超时保护**：可配置计算时间限制，避免长时间等待

### 详细文件信息

- **文件大小**：以易读格式显示文件大小
- **修改时间**：显示文件最后修改时间
- **图片分辨率**：对于支持的图片文件（jpg, jpeg, png, gif, webp, svg），显示宽度和高度信息
- **格式化显示**：中文友好的日期时间格式

### 灵活的配置

- **单位基底切换**：支持 1000（KB / MB / GB）和 1024（KiB / MiB / GiB）两种计算方式
- **超时设置**：可调节文件夹计算的最大等待时间（1 - 60秒）
- **调试模式**：开发者友好的详细日志输出

## 效果演示

![文件夹信息展示](assets/images/文件夹效果演示.png)

悬浮在文件夹上显示大小、文件数量、修改时间等信息↑

![文件信息展示](assets/images/文件效果演示.png)

悬浮在文件上显示大小和修改时间↑

![兼容性展示](assets/images/兼容性.png)

与其他扩展的悬浮提示良好兼容↑

## 安装使用

1. 在 VS Code 扩展市场搜索“Tree Enhancer”
2. 点击安装并重启 VS Code
3. 将鼠标悬浮在资源管理器中的文件或文件夹上即可查看详细信息

## 扩展设置

本扩展提供以下配置选项：

- `eggroll-tree-enhancer.maxCalculationTime`: 文件夹大小计算的最大等待时间（毫秒），默认 5000ms，范围 1000-60000 ms
- `eggroll-tree-enhancer.fileSizeBase`: 文件大小计算基底，可选 1000（十进制）或 1024（二进制），默认 1000
- `eggroll-tree-enhancer.debugMode`: 启用调试模式，输出详细日志，默认关闭
- `eggroll-tree-enhancer.imageResolutionTemplate`: 图片分辨率信息显示模板，默认为"分辨率：{width}（宽） * {height}（高）"

### 配置示例

```json
{
    "eggroll-tree-enhancer.maxCalculationTime": 10000,
    "eggroll-tree-enhancer.fileSizeBase": 1024,
    "eggroll-tree-enhancer.debugMode": false,
    "eggroll-tree-enhancer.imageResolutionTemplate": "分辨率：{width}（宽） * {height}（高）"
}
```

## 使用技巧

- **大文件夹优化**：对于包含大量文件的文件夹，可以适当增加 `maxCalculationTime` 设置
- **单位偏好**：习惯传统计算机单位的用户可以将 `fileSizeBase` 设置为 1024
- **问题诊断**：遇到问题时可以临时开启 `debugMode` 查看详细日志

## 贡献

如何国际化？您可以复制 `package.nls.json` 文件，增加您国家/地区地语言文件，如 `package.nls.zh-cn.json`，将键值对中的值翻译为您的语言，并提交 issue 或 PR。

## 开发者信息

蛋卷儿（EggRoll）

博客：<https://eggroll.pages.dev>
