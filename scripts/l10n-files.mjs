// l10n 文件清单的唯一所有者。
//
// check 与 sort 必须共用这份发现逻辑：一旦两边对「哪些文件算 l10n」的口径分叉，
// 就会出现「门禁通过、但 sort 漏改」的静默漏洞。语言列表由文件名扫描得出，
// 不硬编码，因此同一份实现可同时服务两语言与四语言的仓库。
//
// 路径均相对于当前工作目录，约定脚本在仓库根目录运行（pnpm script 即是如此）。

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BUNDLE_DIR = "l10n";
const BUNDLE_RE = /^bundle\.l10n(\.[\w-]+)?\.json$/;
const NLS_RE = /^package\.nls(\.[\w-]+)?\.json$/;

// 运行时 bundle：仓库可能没有该目录（例如只有 manifest 文案的扩展）
function bundleFiles() {
  if (!existsSync(BUNDLE_DIR)) return [];
  return readdirSync(BUNDLE_DIR)
    .filter((name) => BUNDLE_RE.test(name))
    .map((name) => join(BUNDLE_DIR, name))
    .sort();
}

// manifest 文案：与 package.json 同级
function nlsFiles() {
  return readdirSync(".")
    .filter((name) => NLS_RE.test(name))
    .sort();
}

/**
 * 所有 l10n 分组；没有对应文件的组会被剔除。
 * baseline 是该组的英文基线（无语言后缀）路径，组内其余文件按语言后缀与其对齐。
 */
export function l10nGroups() {
  return [
    {
      label: "运行时 bundle",
      baseline: join(BUNDLE_DIR, "bundle.l10n.json"),
      files: bundleFiles(),
    },
    {
      label: "manifest nls",
      baseline: "package.nls.json",
      files: nlsFiles(),
    },
  ].filter((group) => group.files.length > 0);
}
