import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const dir = "./l10n";

// 缩进固定为 2 空格：与 prettier 默认一致。否则 gen-l10n 与 format:check 会互相覆盖，
// 每跑一次 l10n 生成都要跟着改一次格式
const INDENT = 2;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const fp = join(dir, file);
  const obj = JSON.parse(readFileSync(fp, "utf8"));
  writeFileSync(
    fp,
    JSON.stringify(obj, Object.keys(obj).sort(), INDENT) + "\n",
  );
}
