# Tree Enhancer 开发者文档

这份文档面向维护本扩展的开发者，说明源码结构、关键机制，以及改动时容易出错的地方。

开发环境搭建与提交流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)，发布流程见 [RELEASE.md](../RELEASE.md)，面向用户的功能说明见 [README.md](../README.md)。

## 源码结构

源码按职责分层，入口只负责装配，具体逻辑分散在各目录。修改某一层之前，先确认它是否已被别处复用，避免同一件事出现两份实现。

- `src/extension.ts`：扩展激活入口，装配全部组件、注册命令。全扩展唯一一处配置热加载监听也在这里。
- `src/config.ts`：配置的只读入口。刻意不声明默认值，默认值只由 `package.json` 声明。
- `src/types.ts`：配置、模板变量、图片尺寸、计算结果等类型，以及支持的图片扩展名。
- `src/utils/logger.ts`：分级日志，写入 VSCode 输出通道，并解析调用栈得到调用位置。
- `src/utils/func.ts`：日志的转发出口，只做重新导出。
- `src/utils/file.ts`：文件统计、文件名处理、图片格式与分辨率读取、文件类型判断。
- `src/utils/formatters.ts`：大小、日期时间、模板占位符与状态栏文本的渲染。
- `src/utils/excludeMatcher.ts`：`files.exclude` 匹配的唯一实现，读取配置与匹配都走这里。
- `src/utils/fileWatcher.ts`：文件监控器的创建与管理，区分工作区递归监控与任意目录的非递归监控。
- `src/provider/provider.ts`：文件装饰提供者，负责悬浮提示，以及大文件 L 标识与符号链接 ⤷ 标识。
- `src/statusBarManager.ts`：全扩展唯一的状态栏项，切换显示文件信息、计算中提示与文件夹计算结果。
- `src/selectionMonitor.ts`：监听活动编辑器变化，驱动文件信息的显示与刷新。
- `src/calculator/folderCalculator.ts`：递归统计文件夹大小与文件、子目录数量，支持取消。
- `src/calculator/calculateFolderCommand.ts`：计算命令的状态机，处理计算中、已有结果、取消，以及配置变更后按新配置重新渲染。
- `src/terminalExplorer/terminalTracker.ts`：追踪活动终端的工作目录并广播变化。
- `src/terminalExplorer/treeDataProvider.ts`：终端文件树的数据源，负责懒加载、排除过滤与排序。
- `src/terminalExplorer/fileOperations.ts`：新建、重命名、删除、下载、打开、复制路径等命令的实现。
- `src/terminalExplorer/treeDragAndDrop.ts`：树内拖动移动，以及从系统拖入文件的上传。
- `src/provider/index.ts`、`src/calculator/index.ts`、`src/terminalExplorer/index.ts`：目录内的转发导出，用来统一导入路径。
- `src/test/`：单元测试，用 Node 内置的 `node:test` 编写，`vscodeStub.ts` 模拟 `vscode` 命名空间。

## 关键机制

### 终端工作目录的追踪

终端文件树的根目录来自活动终端的工作目录（CWD，current working directory）。获取顺序有三级回退：优先取 shell integration 提供的实时 CWD，执行 `cd` 后会立即更新；其次取终端创建时指定的目录；最后退回工作区根目录。三级都拿不到时，这个函数返回空值，由调用方决定后续回退。

监听 shell integration 变化、活动终端切换、终端开启与关闭这四类事件，统一经过 300 毫秒防抖，避免快速切换终端或连续 `cd` 时反复刷新。没有活动终端时，回退到工作区根目录，没有工作区再回退到用户主目录，保证树始终有内容可显示。只有本地文件系统（`file` 协议）的路径会被采纳，远程 URI 不处理。

树侧收到新目录后只更新 CWD 并整体重绘，目录监控器的切换由 `src/extension.ts` 统一负责，先释放旧的再创建新的。

### 文件监控与装饰失效

监控器有两类，都由 `FileWatcherManager` 创建，生命周期挂在扩展的订阅列表上。

- 工作区监控：对每个工作区目录用 `**/*` 递归订阅，只监听修改与新建，不监听删除。删除后的节点与装饰由 VSCode 官方资源管理器自行处理。
- 终端目录监控：对当前 CWD 用单层 `*` 订阅，增删改共用同一个回调。

终端目录监控是非递归的，因为树是懒加载的，只有当前展开的那一层需要即时反映变化，更深层的变更由顶栏的强制刷新按钮承担。

装饰的失效是显式触发的。VSCode 会缓存装饰的悬浮提示，不主动通知就不会更新，所以 CWD 内的文件变化要同时刷新树和对应文件的装饰，工作区内的变化还会额外刷新当前选中的文件。

### 配置的单一事实源

所有配置项都在 `package.json` 的 `contributes.configuration` 里声明，默认值也在那里。`src/config.ts` 读取时不传第二个参数，因此用户未设置时拿到的是 `package.json` 声明的那份默认值，而不是在代码里另写一份。同一份默认值写两处，迟早会漂移。

代价在类型上：`get()` 的签名允许返回 `undefined`，所以统一经过一个断言收窄的辅助方法处理。由此带来一条硬性要求：新增配置项必须同时写进 `package.json`，否则读取处会静默拿到 `undefined`，不会报错。

配置热加载只有一处监听，在 `src/extension.ts`。各模块不要自己再注册 `onDidChangeConfiguration`，否则同一次配置变更会被处理多次。

### 符号链接与 files.exclude

`readDirectory` 对符号链接返回的是“目标类型按位或 SymbolicLink”这样的组合值，所以判断类型必须用位运算，不能用相等比较。

符号链接的装饰分两种：工作区外的由本扩展给出 ⤷ 标识与本地化提示，工作区内的交给官方装饰提供者，本扩展返回空值，避免两层标识叠加。

排除规则的匹配只有一份实现，在 `src/utils/excludeMatcher.ts`，配置读取与匹配共用。匹配时有一个 `matchDescendants` 选项，决定是否连被排除目录的后代一起挡掉，它是必填项：

- 监控侧必须传 `true`。整棵工作区被全量订阅，不挡掉的话，被排除目录里的文件依然会进入装饰计算。
- 树侧传 `false`。树在读取时逐项过滤，若在这里挡掉后代，当 CWD 正好落在被排除目录内时，整棵树会显示为空。

另外，工作区外的路径一律按未排除处理。

### 状态栏信息

全扩展只有一个状态栏项，左对齐，优先级取 -2000。文件信息、计算中提示、文件夹计算结果三类内容都写同一个项，靠是否启用自动消失来区分。因此切换文件时，后一条信息会直接替换前一条，不会并存。点击状态栏时，正在计算则取消计算，否则隐藏。

### 文件夹大小计算

递归读取目录，同层的文件与子目录都用 `Promise.all` 一次性展开。这里没有并发上限，`_maxConcurrency` 记录的是观测到的并发峰值，只写入日志，不构成限制。

取消靠一个标志位，在递归入口与进入每层目录时检查。已经发出、正在等待的读取不会被中断，只是结果会被丢弃。单个文件或子目录读取失败时记一条警告并给出 -1 或零值，不中断整体统计。

### 本地化

源码里的界面文本统一走 `vscode.l10n.t()`。执行 `pnpm run gen-l10n` 会用 `vscode-l10n-dev` 从源码导出英文基线 `l10n/bundle.l10n.json`，并顺带按键的字典序重排；中文译文手工维护在 `l10n/bundle.l10n.zh-cn.json`。

`package.json` 里的界面文案用 `%键名%` 占位，对应文案在 `package.nls.json` 与 `package.nls.zh-cn.json`。

门禁脚本 `scripts/check-l10n.mjs` 校验三类问题：每个文件的键序是否等于自身按键排序后的结果、各语言文件的键集合是否与英文基线一致、`package.nls.json` 的键与 `package.json` 中的 `%键名%` 引用是否互相闭合。修复键序用 `node scripts/sort-l10n.mjs`，缺键与占位符不一致必须人工补齐。

上面这两组文件（`l10n/` 下的运行时 bundle 与仓库根的 `package.nls*.json`）由 `scripts/l10n-files.mjs` 统一发现，校验与排序共用同一份逻辑，避免两边对“哪些文件算 l10n”的口径分叉。

### 日志

日志分 trace、debug、info、warn、error 五级，写入 VSCode 输出通道，级别由用户在输出面板自行切换。每条日志会解析调用栈，带上形如 `src/xxx.ts:行号` 的调用位置，便于定位。

`getLogger()` 第一次返回一个所有方法为空的对象，`initLogger()` 初始化时就地替换这些方法，而不是重新赋值引用。这样各模块在文件顶部写下的 `const log = getLogger()` 在初始化之后就是有效的，不必等初始化完成再取。

## 检查清单

两个工作流都调用 `.github/actions/setup`，它依次执行以下命令。本地推送前跑同样这几条，即可与 CI 对齐。

```sh
pnpm install --frozen-lockfile
pnpm test          # 类型检查 + 单元测试
pnpm run l10n:check
pnpm run l10n:parity
pnpm run format:check
pnpm run package   # 类型检查 + 生产构建
```

`l10n:check` 会重新生成 l10n 文件并与已提交内容比对，所以要在干净的工作区上运行。格式化用 `pnpm run format` 自动修正。

## 容易出错的地方

- 新增配置项忘了写进 `package.json`：`src/config.ts` 不提供默认值，读取处会静默拿到 `undefined`。改动时同步 `package.json` 与两份 nls 文件。
- `matchDescendants` 传错：监控侧必须 `true`，树侧必须 `false`。传反会让 CWD 落在被排除目录内时整棵树显示为空。
- 排除逻辑的两处守卫不一致：监控侧的 `shouldHandle` 没有工作区判断，树侧的 `isExcluded` 有。工作区外的路径在两侧可能得到不同结果，这是既有行为，改动时两处要一起看。
- 符号链接在工作区内外的装饰走两套逻辑。只改一侧，会出现同一种符号链接在工作区内没有标识、工作区外有标识。
- 文件类型判断口径不统一：`src/terminalExplorer/treeDataProvider.ts` 用位运算，`src/calculator/folderCalculator.ts` 用精确相等。后者会把符号链接既不算文件也不算目录，整体忽略，改动统计逻辑时注意这一点。
- 终端目录监控是非递归的，只覆盖直接子节点。深层目录的增删不会自动刷新，只能靠强制刷新，不要误以为会自动更新。
- 拖放控制器在 `TreeView` 创建时确定，运行期无法替换，改动 `explorer.enableDragAndDrop` 需要重启才能生效。
- `startupDelay` 的延迟窗口内，装饰提供者尚未创建，配置监听通过可选引用访问它，这个窗口内触发的装饰刷新会被静默忽略。
- `selectionMonitor.refreshCurrentFile` 是异步方法，调用处有意不加 `await`。改动其内部逻辑时注意异常不会向外传播。
- 取选中项的口径不同：新建与重命名只取右键点击的那一项，删除、下载、复制路径取整个选中集合。混用会导致多选时定位到错误的项。
