# Tree Enhancer 文件树增强

**注意：如果您初次安装或升级了该扩展，建议重新启动 VSCode 以确保全部本地化功能正常载入。大部分配置修改会实时生效，无需重启。**

**Note: If you have just installed or upgraded this extension, it is recommended to restart VSCode to ensure that all localization features are loaded properly. Most configuration changes take effect in real time without restarting.**

[GotoEnglishVersion](#englishversion)

## 功能演示

- 终端文件浏览器：在 Explorer 侧栏中新增一个自定义文件树，始终追随当前终端的工作目录（CWD）。切换终端时树自动跟随切换，是您"终端的文件管理器"。

    - 支持新建文件 / 新建文件夹、重命名、删除（回收站与彻底删除），支持多选批量删除
    - 支持拖放：树内移动文件，或从系统拖入文件进行上传
    - 远程模式下支持将文件下载到本地
    - 文件夹右键菜单支持在新窗口中打开该文件夹，或打开该文件夹下的 `.code-workspace` 工作区
    - 可通过设置开启遵循 `files.exclude` 排除规则（默认关闭，显示全部文件与文件夹）

    <!-- TODO: 待补充截图 -->

- 文件信息：悬浮在文件上时，显示文件的详细信息，支持所有文件类型。

    ![文件信息](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/文件信息.png)

- 媒体文件元信息展示：对于媒体文件做了特殊优化，可以读取其元信息，如图片的分辨率（当前版本只支持图片，日后会逐渐加入更多媒体文件类型）。

    ![媒体文件元信息](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/媒体文件元信息.png)

- 文件夹大小计算：可以计算文件夹的总大小，支持通过右键菜单或快捷键触发计算，并在状态栏显示结果（结果默认显示 10 秒，可以通过点击来关闭，设置中可调节）。
  ![文件夹大小计算](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/文件夹大小计算.png)
  ![计算结果](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/计算结果.png)
  ![关闭方式](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/关闭方式.png)

- 文件信息即时显示：打开或切换文件时，状态栏自动显示文件名、大小和修改时间（默认显示 10 秒，可通过点击关闭，设置中可调节显示时长）。文件内容变更时，信息自动刷新并重置计时。关闭所有编辑器时，信息随之自动隐藏。可在设置中通过 `tree-enhancer.fileInfo.enabled` 独立开启或关闭此功能（默认关闭，需要时请在设置中开启）。

- 大文件标注：对于大文件，会用类似 Git 扩展的样式进行标识（追加一个 L 标志，可以和 Git 标志共存），方便用户识别，和 Git 的集成性非常好。假如您的工作区是 Git 仓库，这将有效提示用户，避免误提交大文件。纵使您不使用 Git 仓库，该标识也有助于您识别大文件。默认显示 L 的阈值是 20 MB/MiB，可以在设置中调整。

    ![大文件标识](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/大文件标识.png)
    ![与 Git 的集成](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/与-git-的集成.png)

## 配置选项

您可以在 VSCode 的设置中搜索 `tree-enhancer` 来定位到本扩展的配置选项，也可直接编辑 `settings.json`。

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `tree-enhancer.terminalExplorer.enabled` | `true` | 是否启用终端文件浏览器视图 |
| `tree-enhancer.terminalExplorer.followExcludes` | `false` | 终端文件浏览器是否遵循 `files.exclude` 排除规则。关闭时显示终端工作目录下所有文件（含被排除项，如 `.git`） |
| `tree-enhancer.fileInfo.enabled` | `false` | 打开或切换文件时是否在状态栏自动显示文件信息（默认关闭，需显式开启） |
| `tree-enhancer.fileSizeBase` | `1000` | 文件大小计算基底。`1000`（十进制，KB/MB/GB）或 `1024`（二进制，KiB/MiB/GiB） |
| `tree-enhancer.fileTemplate` | 详情模板 | 文件悬浮提示的显示模板，支持 `{name}`、`{size}`、`{rawSize}`、`{modifiedTime}` 占位符 |
| `tree-enhancer.imageFileTemplate` | 详情模板 | 图片悬浮提示的显示模板，额外支持 `{resolution}`、`{width}`、`{height}` 占位符 |
| `tree-enhancer.imageResolutionTemplate` | 分辨率模板 | 图片分辨率信息的显示模板，支持 `{width}`、`{height}` 占位符 |
| `tree-enhancer.dateTimeFormat` | `YYYY-MM-DD HH:mm:ss` | 日期时间显示格式，支持 `YYYY`、`MM`、`DD`、`HH`、`mm`、`ss` 占位符 |
| `tree-enhancer.startupDelay` | `0` | 扩展启动后的延迟工作时间（秒），用于错峰计算 |
| `tree-enhancer.largeFileThreshold` | `20` | 大文件识别阈值（单位随 `fileSizeBase`）。超过该大小显示 L 标识，设为 `0` 关闭 |
| `tree-enhancer.folderCalculator.dismissDelay` | `10` | 文件夹大小计算结果在状态栏自动消失的延迟时间（秒），设为 `0` 不自动消失 |
| `tree-enhancer.folderCalculator.statusBarTemplate` | 默认模板 | 文件夹计算结果在状态栏的显示模板，支持 `{folderName}`、`{totalSize}`、`{fileCount}`、`{folderCount}`、`{modifiedTime}` 占位符 |

## 贡献与本地化

欢迎任何形式的贡献，尤其是本地化支持。

如需添加新的语言：

1. 请复制 `package.nls.json` 文件，创建您所在区域的语言文件（如 `package.nls.de.json` 或 `package.nls.zh-cn.json`），翻译文件中的键值对中的所有值
2. 复制 `l10n` 目录下的 `bundle.l10n.json` 文件，创建您所在区域的语言文件（如 `bundle.l10n.de.json` 或 `bundle.l10n.zh-cn.json`），翻译文件中的键值对中的所有值
3. 通过 Issue 或 Pull Request 提交

## CI/CD 工作流

本扩展使用 GitHub Actions 进行持续集成与交付：

- **CI 构建**：推送到 `main` 分支（非 tag）时自动构建并上传 vsix 到 Actions Artifacts，方便测试
- **正式发布**：推送 tag（如 `2.0.0`）时自动构建、发布到 VSCode Marketplace、创建 GitHub Release 并上传 vsix 到 Release Assets

### 发布的 Token 配置

发布到 VSCode Marketplace 需要配置以下 Token：

| Token          | 用途                        | 获取方式                                                                                                                                                                                                                                              |
| -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VSCE_PAT`     | VSCode Marketplace 发布凭证 | 登录 [Azure DevOps](https://dev.azure.com) → 右上角 Personal Access Tokens → 创建时选择 **Marketplace (Publish)** 作用域，保存后添加到 GitHub 仓库的 Secrets（Settings → Secrets and variables → Actions → New repository secret，命名为 `VSCE_PAT`） |

> **注意**：`VSCE_PAT` 是发布到 Marketplace 的必需凭证，没有它发布步骤会失败。

## 为什么要开发此扩展

查看文件的信息、属性、文件夹信息是日常生活中的高频操作，但 VSCode 默认的资源管理器树并不支持这些功能。虽然可以通过定位到资源管理器，再右键菜单查看文件属性，但这需要多次点击，且不够直观。VSCode 默认的悬浮提示只展示无关紧要的信息，这没有充分利用到这一操作，是一种浪费。对于本扩展旨在通过悬浮提示的方式，快速、直观地展示文件和文件夹的关键信息，提升用户的工作效率。同时，终端文件浏览器让您可以像使用文件管理器一样，在终端的文件系统视图中直接操作文件，进一步打通终端与图形界面之间的工作流。

# EnglishVersion

## Feature Demonstration

- Terminal File Explorer: A custom file tree is added to the Explorer sidebar that always follows the working directory (CWD) of the current terminal. The tree switches automatically when you switch terminals — it is your "file manager for the terminal".

    - Create new files / new folders, rename, delete (Move to Trash and Delete Permanently), with multi-select batch delete support
    - Drag and drop support: move files within the tree, or drag files in from your system to upload
    - In remote mode, files can be downloaded to your local machine
    - Folder context menu supports opening the folder in a new window, or opening a `.code-workspace` workspace file under the folder
    - Optionally respects the `files.exclude` patterns via settings (off by default; shows all files and folders)

    <!-- TODO: add screenshot -->

- File Information: When hovering over a file, its detailed information is displayed, supporting all file types.

    ![File Information](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/文件信息.png)

- Media File Metadata Display: Special optimization is made for media files to read their metadata, such as image resolution (only images are supported in the current version; more media file types will be added gradually in the future).

    ![Media File Metadata](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/媒体文件元信息.png)

- Folder Size Calculation: The total size of a folder can be calculated. The calculation can be triggered via the right-click menu or shortcut keys, and the result is displayed in the status bar (the result is shown for 10 seconds by default, which can be closed by clicking and adjustable in settings).
  ![Folder Size Calculation](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/文件夹大小计算.png)
  ![Calculation Result](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/计算结果.png)
  ![Closure Method](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/关闭方式.png)

- Instant File Info: When opening or switching files, the status bar instantly displays the file name, size, and modification time (shown for 10 seconds by default, can be closed by clicking, duration adjustable in settings). The info refreshes automatically when the file content changes and the timer resets. When all editors are closed, the info hides automatically. Can be independently enabled/disabled via `tree-enhancer.fileInfo.enabled` in settings (off by default, enable it in settings if needed).

- Large File Marking: Large files are identified in a style similar to Git extensions (an "L" flag is appended, which can coexist with Git flags), making it easy for users to recognize them with excellent Git integration. If your workspace is a Git repository, this will effectively remind you to avoid accidentally committing large files. Even if you do not use a Git repository, this flag still helps you identify large files. The default threshold for displaying the "L" flag is 20 MB/MiB, which can be adjusted in settings.

    ![Large File Marking](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/大文件标识.png)
    ![Integration with Git](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/readme-img/与-git-的集成.png)

## Configuration Options

You can search for `tree-enhancer` in VSCode Settings to locate the configuration options of this extension, or edit `settings.json` directly.

| Config Key | Default | Description |
| ---------- | ------- | ----------- |
| `tree-enhancer.terminalExplorer.enabled` | `true` | Whether the Terminal File Explorer view is enabled |
| `tree-enhancer.terminalExplorer.followExcludes` | `false` | Whether the Terminal File Explorer respects `files.exclude` patterns. When disabled, all files under the terminal's working directory are shown (including excluded ones such as `.git`) |
| `tree-enhancer.fileInfo.enabled` | `false` | Whether to automatically show file info in the status bar when opening or switching files (off by default; enable explicitly in settings) |
| `tree-enhancer.fileSizeBase` | `1000` | File size calculation base. `1000` (decimal, KB/MB/GB) or `1024` (binary, KiB/MiB/GiB) |
| `tree-enhancer.fileTemplate` | Detail template | Display template for file hover tooltips, supporting `{name}`, `{size}`, `{rawSize}`, `{modifiedTime}` placeholders |
| `tree-enhancer.imageFileTemplate` | Detail template | Display template for image hover tooltips, additionally supporting `{resolution}`, `{width}`, `{height}` placeholders |
| `tree-enhancer.imageResolutionTemplate` | Resolution template | Display template for image resolution, supporting `{width}`, `{height}` placeholders |
| `tree-enhancer.dateTimeFormat` | `YYYY-MM-DD HH:mm:ss` | Date and time display format, supporting `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` placeholders |
| `tree-enhancer.startupDelay` | `0` | Delay (in seconds) before the extension starts working after VSCode startup |
| `tree-enhancer.largeFileThreshold` | `20` | Large file recognition threshold (unit follows `fileSizeBase`). Files exceeding this size show the L flag; set to `0` to disable |
| `tree-enhancer.folderCalculator.dismissDelay` | `10` | Delay (in seconds) before the folder calculation result automatically disappears from the status bar; set to `0` to keep it until closed manually |
| `tree-enhancer.folderCalculator.statusBarTemplate` | Default template | Display template for folder calculation results in the status bar, supporting `{folderName}`, `{totalSize}`, `{fileCount}`, `{folderCount}`, `{modifiedTime}` placeholders |

## Contribution and Localization

Contributions in any form are welcome, especially localization support.

To add a new language:

1. Copy the `package.nls.json` file and create a language file for your region (e.g., `package.nls.de.json` or `package.nls.zh-cn.json`), then translate all values in the key-value pairs of the file.
2. Copy the `bundle.l10n.json` file in the `l10n` directory and create a language file for your region (e.g., `bundle.l10n.de.json` or `bundle.l10n.zh-cn.json`), then translate all values in the key-value pairs of the file.
3. Submit via Issue or Pull Request.

## CI/CD Workflow

This extension uses GitHub Actions for continuous integration and delivery:

- **CI Build**: Pushes to the `main` branch (non-tag) automatically build and upload the vsix to Actions Artifacts for testing
- **Release**: Pushing a tag (e.g. `2.0.0`) automatically builds, publishes to the VSCode Marketplace, creates a GitHub Release, and uploads the vsix to Release Assets

### Token Configuration for Publishing

Publishing to the VSCode Marketplace requires the following Tokens:

| Token          | Purpose                               | How to Obtain                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VSCE_PAT`     | VSCode Marketplace publish credential | Log in to [Azure DevOps](https://dev.azure.com) → Personal Access Tokens → Create with **Marketplace (Publish)** scope, save it, then add to GitHub repository Secrets (Settings → Secrets and variables → Actions → New repository secret, name it `VSCE_PAT`) |

> **Note**: `VSCE_PAT` is required for publishing to the Marketplace. Without it, the publish step will fail.

## Why This Extension Was Developed

Checking file information, attributes, and folder details are high-frequency daily operations, but VSCode's default Explorer tree does not support these functions. Although you can view file properties through the right-click menu after locating the Explorer, this requires multiple clicks and is not intuitive enough. VSCode's default hover tips only display insignificant information, which underutilizes this interaction and is a waste. This extension aims to quickly and intuitively display key information about files and folders through hover tips, improving your work efficiency. At the same time, the Terminal File Explorer lets you operate files directly in the terminal's filesystem view just like a file manager, further bridging the gap between the terminal and the graphical interface in your workflow.
