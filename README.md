# Tree Enhancer 文件树增强

**注意：如果您初次安装或升级了该扩展，建议重新启动 VSCode 以使全部本地化功能正常载入。**

**Note: If you have just installed or upgraded this extension, it is recommended to restart VSCode to ensure that all localization features are loaded properly.**

[GotoEnglishVersion](#englishversion)

## 功能演示

- 文件大小显示：悬浮在文件上时，显示文件的大小，支持所有文件类型。

    ![文件大小显示](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/assets/gifs/文件大小显示.gif)

- 媒体文件元信息展示：对于媒体文件做了特殊优化，可以读取其元信息，如图片的分辨率（当前版本只支持图片，日后会逐渐加入更多媒体文件类型）。

    ![媒体文件元信息展示](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/assets/gifs/媒体文件元信息显示.gif)

- 大文件标注：对于大文件，会用类似 Git 扩展的样式进行标识（追加一个 L 标志，可以和 Git 标志共存），方便用户识别，和 Git 的集成性非常好。假如您的工作区是 Git 仓库，这将有效提示用户，避免误提交大文件。纵使您不使用 Git 仓库，该标识也有助于您识别大文件。

    ![大文件标注](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/assets/images/大文件标注.png)

    ![与 Git 的集成](https://raw.githubusercontent.com/Jy-EggRoll/tree-enhancer/refs/heads/main/assets/images/与_Git_的集成.png)

## 配置选项

您可以在 VSCode 的设置中搜索 `tree-enhancer` 来定位到本扩展的配置选项。本扩展的配置选项说明详尽而清晰，您可以根据需要进行调整。

## 贡献与本地化

欢迎任何形式的贡献，尤其是本地化支持。

如需添加新的语言：

1. 请复制 `package.nls.json` 文件，创建您所在区域的语言文件（如 `package.nls.de.json` 或 `package.nls.zh-cn.json`），翻译文件中的键值对中的所有值
2. 复制 `l10n` 目录下的 `bundle.l10n.json` 文件，创建您所在区域的语言文件（如 `bundle.l10n.de.json` 或 `bundle.l10n.zh-cn.json`），翻译文件中的键值对中的所有值
3. 通过 Issue 或 Pull Request 提交

## 为什么要开发此扩展

查看文件的信息、属性、文件夹信息是日常生活中的高频操作，但 VSCode 默认的资源管理器树并不支持这些功能。虽然可以通过定位到资源管理器，再右键菜单查看文件属性，但这需要多次点击，且不够直观。VSCode 默认的悬浮提示只展示无关紧要的信息，这没有充分利用到这一操作，是一种浪费。对于本扩展旨在通过悬浮提示的方式，快速、直观地展示文件和文件夹的关键信息，提升用户的工作效率。

## 开发者信息

蛋卷儿（EggRoll）

博客：<https://eggroll.pages.dev>
