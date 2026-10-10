import * as vscode from "vscode";
import { ConfigManager } from "../config";
import { getLogger } from "../utils/logger";

/**
 * 让内置 Git 扩展识别终端 CWD 所在的仓库。
 *
 * 背景：内置 Git 的仓库自动发现只覆盖工作区文件夹与已打开的编辑器
 * （git.autoRepositoryDetection），终端 CWD 不在其检测范围内。因此终端 cd 进一个
 * 工作区之外的仓库时，源代码管理视图不会认识它，用户必须先在该仓库内打开一个文件，
 * 才会经由"打开的文件"这条路径触发识别。
 *
 * 实现上只把路径交给 git.openRepository 命令，不自行判断路径是否为仓库：该命令内部
 * 已完成幂等处理（仓库已打开则直接返回）与非仓库路径的静默忽略，并沿用 git.enabled、
 * 工作区信任、git.ignoredRepositories 等既有规则。自行实现一遍这些判断既属重复，也
 * 必然随官方行为变化而漂移。
 *
 * 工作区之外的仓库如何对待由内置 Git 自己的策略决定（是否询问取决于
 * git.openRepositoryInParentFolders），本扩展只负责触发识别，不干预其行为，也不
 * 主动关闭用户已打开的仓库。
 */
export async function followGitRepository(cwd: vscode.Uri): Promise<void> {
  if (!ConfigManager.getFollowGitRepository()) {
    return;
  }

  const logger = getLogger();
  try {
    await vscode.commands.executeCommand("git.openRepository", cwd.fsPath);
    logger.debug(
      vscode.l10n.t(
        "[Git Repository Follow] Repository registered: {0}",
        cwd.fsPath,
      ),
    );
  } catch (err) {
    // Git 扩展未安装、被 git.enabled 关闭或工作区不受信任时该命令不可用；
    // 此时静默跳过，终端文件树等其他功能不受影响。
    logger.trace(
      vscode.l10n.t("[Git Repository Follow] Not triggered: {0}", cwd.fsPath),
    );
    logger.trace(String(err));
  }
}
