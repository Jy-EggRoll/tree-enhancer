import { readFileSync } from "node:fs";

import { l10nGroups } from "./l10n-files.mjs";

/**
 * l10n 一致性门禁（只读，不写入任何文件）。CI 强制执行三类校验：
 *
 * 1. 键序：每个 l10n 文件的键必须恰好等于自身按键字典序重排的结果。
 *    修复入口是 scripts/sort-l10n.mjs；缩进与换行由 prettier 负责，两者分工不重叠。
 * 2. 跨语言对齐：每种语言文件的键集合必须与英文基线完全一致。抓「新键只译了部分
 *    语言」与「别处删了、这里留下的孤儿键」。
 * 3. manifest 引用闭合：package.nls.json 的键必须恰好等于 package.json 中的 %key%
 *    占位符集合，抓「占位符没有译文」与「译文没人引用」。
 *
 * 英文运行时 bundle 与源码是否一致不在这里校验——那需要重新导出（写文件），由
 * `pnpm run l10n:check`（重新生成后与已提交内容逐字节比对）负责。
 *
 * 键序口径基于 JSON.parse 的键序；l10n 的键都是消息文本，不含整数样式的键
 * （JS 对象会把整数样式的键提前，届时该口径不再可靠）。
 */

const readKeys = (file) => Object.keys(JSON.parse(readFileSync(file, "utf8")));

function checkOrder(file) {
  const keys = readKeys(file);
  const sorted = [...keys].sort();
  const at = keys.findIndex((key, i) => key !== sorted[i]);
  if (at === -1) return true;
  console.error(
    `${file}: 键序不合字典序，首个错位是第 ${at + 1} 个键 "${keys[at]}"（应为 "${sorted[at]}"）`,
  );
  return false;
}

function checkAlignment(group) {
  if (!group.files.includes(group.baseline)) {
    console.error(`${group.label}: 找不到英文基线 ${group.baseline}`);
    return false;
  }

  const base = readKeys(group.baseline);
  const baseSet = new Set(base);
  let ok = true;

  for (const file of group.files) {
    if (file === group.baseline) continue;
    const keys = readKeys(file);
    const keySet = new Set(keys);
    const missing = base.filter((key) => !keySet.has(key));
    const extra = keys.filter((key) => !baseSet.has(key));
    if (!missing.length && !extra.length) continue;

    ok = false;
    console.error(
      `${group.label}: ${file} 与 ${group.baseline} 的键集合不一致`,
    );
    if (missing.length) console.error(`  缺失: ${missing.join(", ")}`);
    if (extra.length) console.error(`  多余: ${extra.join(", ")}`);
  }
  return ok;
}

function checkManifestRefs(baseline) {
  const refs = new Set(
    [...readFileSync("package.json", "utf8").matchAll(/%([^%]+)%/g)].map(
      (match) => match[1],
    ),
  );
  const nls = new Set(readKeys(baseline));

  const missing = [...refs].filter((key) => !nls.has(key));
  const dead = [...nls].filter((key) => !refs.has(key));

  if (missing.length) {
    console.error(
      `${baseline} 缺少 package.json 引用的键: ${missing.join(", ")}`,
    );
  }
  if (dead.length) {
    console.error(
      `${baseline} 存在 package.json 未引用的键: ${dead.join(", ")}`,
    );
  }
  return !missing.length && !dead.length;
}

const groups = l10nGroups();
if (!groups.length) {
  console.error(
    "未发现任何 l10n 文件（l10n/bundle.l10n*.json 或 package.nls*.json）——该门禁在此仓库无生效对象",
  );
  process.exit(1);
}

let ok = true;
let fileCount = 0;

for (const group of groups) {
  fileCount += group.files.length;
  for (const file of group.files) {
    if (!checkOrder(file)) ok = false;
  }
  if (!checkAlignment(group)) ok = false;
}

const nlsGroup = groups.find((group) => group.baseline === "package.nls.json");
if (nlsGroup && !checkManifestRefs(nlsGroup.baseline)) ok = false;

if (ok) {
  console.log(
    `l10n OK（${fileCount} 个文件：键序 / 跨语言对齐 / manifest 引用）`,
  );
  process.exit(0);
}

console.error(
  "\n修复：node scripts/sort-l10n.mjs 重排键序；缺失键或占位符不一致需人工补齐",
);
process.exit(1);
