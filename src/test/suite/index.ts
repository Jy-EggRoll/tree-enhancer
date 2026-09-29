/**
 * 单元测试入口。
 *
 * 由 scripts/run-tests.cjs 用 esbuild 打包后交给 Node 内置测试运行器执行。
 * 新增测试文件时在此 import 即可（node:test 在导入时注册用例）。
 */

import "./excludeMatcher.test";
import "./formatters.test";
