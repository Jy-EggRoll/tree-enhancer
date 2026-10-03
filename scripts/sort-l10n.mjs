import { readFileSync, writeFileSync } from "node:fs";

import { l10nGroups } from "./l10n-files.mjs";

/**
 * l10n 文件规范化，是这套流程里唯一的写入方：按字典序重排键，并统一为
 * 2 空格缩进 + 末尾换行。
 *
 * 2 空格是为了与 prettier 默认一致——否则「重新生成 l10n」与「format:check」
 * 会互相覆盖，每跑一次生成都要跟着改一次格式。排序放在这里而不是交给 prettier，
 * 是因为 prettier 不排序对象键。
 *
 * 键序用 Object.keys().sort()（码元序），必须与 check-l10n.mjs 的校验口径一致；
 * 文件清单由 l10n-files.mjs 统一给出，保证 check 与 sort 不会各认一套文件。
 */

const INDENT = 2;

const files = l10nGroups().flatMap((group) => group.files);
if (!files.length) {
  console.log("sort-l10n: 未发现 l10n 文件，无需处理");
  process.exit(0);
}

for (const file of files) {
  const obj = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(
    file,
    JSON.stringify(obj, Object.keys(obj).sort(), INDENT) + "\n",
  );
}

console.log(
  `sort-l10n: 已规范化 ${files.length} 个文件（键序 + ${INDENT} 空格缩进）`,
);
