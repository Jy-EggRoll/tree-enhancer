import { readFileSync, readdirSync } from "node:fs";

/**
 * l10n parity guard。
 *
 * 两类事实源各自校验键集合，CI 强制执行：
 *
 * 1. 运行时 bundle（l10n/bundle.l10n*.json）与 manifest 字符串
 *    （package.nls*.json）：每个语言的键集合必须与英文（无语言后缀）完全一致。
 *    这能抓出"只翻译了部分语言的新键"与"别处删了、这里留下的孤儿键"。
 * 2. package.nls.json 的键必须恰好等于 package.json 中的 %key% 占位符集合。
 *    这能同时抓出"占位符没有译文"与"译文没人引用"两类漂移。
 *
 * 语言列表由目录扫描得出，不硬编码：新增语言文件即自动纳入校验。
 * 英文运行时 bundle 与源码的一致性不在此校验（那是 gen-l10n + l10n:check 的职责）。
 */

const isBundle = (name) => /^bundle\.l10n(\.[\w-]+)?\.json$/.test(name);
const isNls = (name) => /^package\.nls(\.[\w-]+)?\.json$/.test(name);

const bundleFiles = readdirSync("l10n")
  .filter(isBundle)
  .map((name) => `l10n/${name}`);
const nlsFiles = readdirSync(".").filter(isNls);

const keysOf = (file) =>
  new Set(Object.keys(JSON.parse(readFileSync(file, "utf8"))));

/** 英文基线：文件名恰好为 `<prefix>.json`（无语言后缀） */
const englishOf = (files, prefix) =>
  files.find((file) => file.split("/").pop() === `${prefix}.json`);

function sameKeys(label, prefix, files) {
  const baselineFile = englishOf(files, prefix);
  if (!baselineFile) {
    console.error(`${label}: 未找到英文基线文件 ${prefix}.json`);
    return false;
  }

  const base = keysOf(baselineFile);
  let ok = true;
  for (const file of files) {
    if (file === baselineFile) continue;
    const keys = keysOf(file);
    const missing = [...base].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !base.has(key));
    if (missing.length || extra.length) {
      ok = false;
      console.error(`${label}: ${file} 与 ${baselineFile} 不一致`);
      if (missing.length) console.error(`  缺失键: ${missing.join(", ")}`);
      if (extra.length) console.error(`  多余键: ${extra.join(", ")}`);
    }
  }
  return ok;
}

function nlsMatchesManifest() {
  const manifest = readFileSync("package.json", "utf8");
  const refs = new Set(
    [...manifest.matchAll(/%([^%]+)%/g)].map((match) => match[1]),
  );
  const nls = keysOf("package.nls.json");

  const missing = [...refs].filter((key) => !nls.has(key));
  const dead = [...nls].filter((key) => !refs.has(key));

  if (missing.length) {
    console.error(
      `package.nls.json 缺少 package.json 引用的键: ${missing.join(", ")}`,
    );
  }
  if (dead.length) {
    console.error(
      `package.nls.json 存在 package.json 未引用的键: ${dead.join(", ")}`,
    );
  }
  return { ok: !missing.length && !dead.length, count: nls.size };
}

const bundleOk = sameKeys("运行时 bundle", "bundle.l10n", bundleFiles);
const nlsOk = sameKeys("manifest nls", "package.nls", nlsFiles);
const { ok: refOk, count } = nlsMatchesManifest();

if (bundleOk && nlsOk && refOk) {
  console.log(
    `l10n parity OK (运行时 bundle: ${keysOf("l10n/bundle.l10n.json").size} 键, manifest nls: ${count} 键)`,
  );
  process.exit(0);
}
process.exit(1);
