import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    pathMatchesExclude,
    isExcludedByConfig,
    readExcludePatterns,
} from "../../utils/excludeMatcher";
import { __setConfig, __setRelativePathOverride, __reset } from "../vscodeStub";

/**
 * excludeMatcher 单元测试。
 *
 * 重点覆盖两类历史缺陷：
 * 1. 两处调用方语义必须不同 —— 监控需要 matchDescendants:true（挡掉被排除目录
 *    的后代），树需要 false（懒加载下不挡，否则 CWD 位于排除目录内时整层被隐藏）。
 * 2. 目录前缀兜底依赖前置斜杠，因此"根层"与"深层"路径命中结果不同，
 *    这一根层/深层边界曾导致回归，必须锁死。
 */

const WATCH = { matchDescendants: true };
const TREE = { matchDescendants: false };

describe("pathMatchesExclude：基础 glob 匹配", () => {
    test("精确名称命中", () => {
        assert.equal(pathMatchesExclude("node_modules", "**/node_modules", TREE), true);
        assert.equal(pathMatchesExclude("sub/node_modules", "**/node_modules", TREE), true);
    });

    test("不相关路径不命中", () => {
        assert.equal(pathMatchesExclude("src/a.ts", "**/node_modules", TREE), false);
    });

    test("dot 文件可被匹配（需 dot:true）", () => {
        assert.equal(pathMatchesExclude(".git", "**/.git", TREE), true);
        assert.equal(pathMatchesExclude(".DS_Store", "**/.DS_Store", TREE), true);
    });

    test("非 globstar 模式不触发兜底，与 minimatch 等价", () => {
        // "dist" 不以 ** 开头，故 matchDescendants 不影响结果
        for (const opts of [TREE, WATCH]) {
            assert.equal(pathMatchesExclude("dist", "dist", opts), true);
            assert.equal(pathMatchesExclude("a/dist/b.js", "dist", opts), false);
        }
    });
});

describe("pathMatchesExclude：根层 vs 深层边界（回归锁定）", () => {
    test("根层后代：兜底不命中（缺前置斜杠），两种模式结果相同", () => {
        // node_modules/foo/a.js 中不含 "/node_modules/"，故兜底不触发
        assert.equal(pathMatchesExclude("node_modules/foo/a.js", "**/node_modules", TREE), false);
        assert.equal(pathMatchesExclude("node_modules/foo/a.js", "**/node_modules", WATCH), false);
    });

    test("深层后代：兜底命中，监控 true / 树 false —— 两者必须不同", () => {
        for (const p of ["sub/node_modules/a.js", "sub/node_modules/foo/a.js", "a/b/node_modules/x/y.js"]) {
            assert.equal(
                pathMatchesExclude(p, "**/node_modules", WATCH),
                true,
                `监控应挡掉 ${p}`,
            );
            assert.equal(
                pathMatchesExclude(p, "**/node_modules", TREE),
                false,
                `树不应挡掉 ${p}（否则 CWD 在该目录内时整层被隐藏）`,
            );
        }
    });

    test("以目录名结尾的路径也命中兜底", () => {
        assert.equal(pathMatchesExclude("a/b/node_modules", "**/node_modules", WATCH), true);
        assert.equal(pathMatchesExclude("a/b/node_modules", "**/node_modules", WATCH), true);
    });

    test("嵌套 .git 同样遵循根层/深层边界", () => {
        // 根层 .git 的直接子项：兜底需前置斜杠，故不命中（与 node_modules 边界一致）
        assert.equal(pathMatchesExclude(".git/config", "**/.git", WATCH), false);
        // 深层 .git 的后代：兜底命中
        assert.equal(pathMatchesExclude("sub/.git/config", "**/.git", WATCH), true);
        assert.equal(pathMatchesExclude("a/b/.git/HEAD", "**/.git", WATCH), true);
        assert.equal(pathMatchesExclude("a/b/.git/HEAD", "**/.git", TREE), false);
    });
});

describe("readExcludePatterns：配置读取", () => {
    beforeEach(() => __reset());

    test("只取值为 true 的项", () => {
        __setConfig({
            files: { exclude: { "**/.git": true, "**/dist": false, "**/out": true } },
        });
        assert.deepEqual(readExcludePatterns().sort(), ["**/.git", "**/out"]);
    });

    test("无 exclude 配置时返回空数组", () => {
        __setConfig({ files: {} });
        assert.deepEqual(readExcludePatterns(), []);
    });
});

describe("isExcludedByConfig：工作区外守卫", () => {
    beforeEach(() => __reset());

    test("工作区外路径一律不过滤（不论是否命中模式）", () => {
        // asRelativePath 原样返回绝对路径 = 工作区外
        __setRelativePathOverride({ "/outside/node_modules/b.js": "/outside/node_modules/b.js" });
        assert.equal(
            isExcludedByConfig({ fsPath: "/outside/node_modules/b.js" } as never, ["**/node_modules"], WATCH),
            false,
        );
    });

    test("工作区内路径按模式过滤", () => {
        __setRelativePathOverride({ "/ws/src/a.ts": "src/a.ts" });
        // 注意：此处在"树"模式下 src/a.ts 不命中，故为 false
        assert.equal(
            isExcludedByConfig({ fsPath: "/ws/src/a.ts" } as never, ["**/node_modules"], TREE),
            false,
        );
    });

    test("空模式列表始终返回 false", () => {
        __setRelativePathOverride({ "/ws/.git": ".git" });
        assert.equal(
            isExcludedByConfig({ fsPath: "/ws/.git" } as never, [], WATCH),
            false,
        );
    });
});

describe("两处调用方的语义契约", () => {
    test("监控（true）与树（false）在深层后代上必须给出相反结论", () => {
        const path = "sub/node_modules/pkg/index.js";
        const pattern = "**/node_modules";
        assert.notEqual(
            pathMatchesExclude(path, pattern, WATCH),
            pathMatchesExclude(path, pattern, TREE),
            "监控与树对深层后代的判断必须相反，这是本次修复的核心契约",
        );
    });

    test("监控侧等价于旧实现：minimatch 或 目录前缀兜底", () => {
        // 旧 FileWatcherManager.matchesExclude 的行为
        const oldWatch = (rel: string, pattern: string): boolean => {
            if (require("minimatch").minimatch(rel, pattern, { dot: true })) return true;
            if (pattern.startsWith("**/")) {
                const m = pattern.slice(3);
                if (rel.includes("/" + m + "/") || rel.endsWith("/" + m)) return true;
            }
            return false;
        };
        const patterns = ["**/.git", "**/node_modules", "**/dist", "node_modules"];
        const rels = [
            ".git", "sub/.git", "sub/.git/config", "a/b/.git/HEAD",
            "node_modules", "sub/node_modules", "sub/node_modules/x/y.js",
            "node_modules/a.js", "dist/out.js", "a/dist/b.js", "src/a.ts",
        ];
        for (const p of patterns) {
            for (const r of rels) {
                assert.equal(
                    pathMatchesExclude(r, p, WATCH),
                    oldWatch(r, p),
                    `监控模式不一致: pattern=${p} path=${r}`,
                );
            }
        }
    });

    test("树侧等价于旧实现：仅 minimatch", () => {
        const { minimatch } = require("minimatch");
        const patterns = ["**/.git", "**/node_modules", "**/dist", "node_modules"];
        const rels = [
            ".git", "sub/.git", "sub/.git/config", "a/b/.git/HEAD",
            "node_modules", "sub/node_modules", "sub/node_modules/x/y.js",
            "node_modules/a.js", "dist/out.js", "a/dist/b.js", "src/a.ts",
        ];
        for (const p of patterns) {
            for (const r of rels) {
                assert.equal(
                    pathMatchesExclude(r, p, TREE),
                    minimatch(r, p, { dot: true }),
                    `树模式不一致: pattern=${p} path=${r}`,
                );
            }
        }
    });
});
