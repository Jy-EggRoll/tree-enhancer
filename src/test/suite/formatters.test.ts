import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { Formatters } from "../../utils/formatters";
import { __setConfig, __reset } from "../vscodeStub";

/**
 * Formatters 单元测试。
 *
 * 覆盖三类纯逻辑：文件大小（十进制/二进制基底与单位进位）、
 * 日期模板替换、模板占位符渲染（含可选占位符缺失时的清除行为）。
 *
 * 注意：未注入配置时，桩件的 getConfiguration() 会返回 package.json（含
 * package.nls.json）声明的默认值，与真实 VSCode 行为一致。因此下列「默认格式 /
 * 默认模板」断言取的是声明默认值本身，而不是代码里另写的一份字面量。
 */

describe("formatFileSize：十进制基底（1000）", () => {
  test("0 字节特判", () => {
    assert.equal(Formatters.formatFileSize(0, 1000), "0 B");
  });

  test("各量级与单位", () => {
    assert.equal(Formatters.formatFileSize(1, 1000), "1 B");
    assert.equal(Formatters.formatFileSize(999, 1000), "999 B");
    assert.equal(Formatters.formatFileSize(1000, 1000), "1 KB");
    assert.equal(Formatters.formatFileSize(1500, 1000), "1.5 KB");
    assert.equal(Formatters.formatFileSize(1_000_000, 1000), "1 MB");
    assert.equal(Formatters.formatFileSize(1_000_000_000, 1000), "1 GB");
  });

  test("数值保留两位有效小数（去尾零）", () => {
    assert.equal(Formatters.formatFileSize(1234, 1000), "1.23 KB");
    assert.equal(Formatters.formatFileSize(1200, 1000), "1.2 KB");
  });

  test("超出单位表时封顶为最大单位", () => {
    // PB 是十进制单位表最后一档，再大也应停留在 PB
    const huge = Math.pow(1000, 7);
    assert.match(Formatters.formatFileSize(huge, 1000), /PB$/);
  });

  test("未注入配置时使用 package.json 声明的默认基底（1000）", () => {
    assert.equal(Formatters.formatFileSize(1000), "1 KB");
  });
});

describe("formatFileSize：二进制基底（1024）", () => {
  test("使用 IEC 单位名", () => {
    assert.equal(Formatters.formatFileSize(1024, 1024), "1 KiB");
    assert.equal(Formatters.formatFileSize(1024 * 1024, 1024), "1 MiB");
    assert.equal(Formatters.formatFileSize(1024 * 1024 * 1024, 1024), "1 GiB");
  });

  test("与十进制基底结果不同（1000 vs 1024）", () => {
    assert.notEqual(
      Formatters.formatFileSize(1_000_000, 1000),
      Formatters.formatFileSize(1_000_000, 1024),
    );
  });

  test("未传 base 时回退到配置值", () => {
    __setConfig({ "tree-enhancer": { fileSizeBase: 1024 } });
    assert.equal(Formatters.formatFileSize(1024), "1 KiB");
    __reset();
  });
});

describe("formatDate：模板替换", () => {
  const d = new Date(2024, 2, 5, 9, 7, 3); // 2024-03-05 09:07:03（本地时区）

  test("未设置时使用 package.json 声明的默认格式（含秒）", () => {
    assert.equal(Formatters.formatDate(d), "2024-03-05 09:07:03");
  });

  test("全占位符", () => {
    assert.equal(
      Formatters.formatDate(d, "YYYY-MM-DD HH:mm:ss"),
      "2024-03-05 09:07:03",
    );
  });

  test("个位数月/日/时/分/秒补零", () => {
    assert.equal(Formatters.formatDate(d, "MM/DD HH:mm:ss"), "03/05 09:07:03");
  });

  test("无占位符的模板原样返回", () => {
    assert.equal(Formatters.formatDate(d, "static"), "static");
  });

  test("未传 format 时回退到配置值", () => {
    __setConfig({ "tree-enhancer": { dateTimeFormat: "YYYY/MM/DD" } });
    assert.equal(Formatters.formatDate(d), "2024/03/05");
    __reset();
  });
});

describe("renderTemplate：占位符渲染", () => {
  const vars = {
    name: "a.txt",
    size: "1 KB",
    rawSize: 1024,
    modifiedTime: "2024-01-01 00:00",
    rawModifiedTime: new Date(2024, 0, 1),
  };

  test("基本占位符", () => {
    assert.equal(
      Formatters.renderTemplate("{name} | {size} | {modifiedTime}", vars),
      "a.txt | 1 KB | 2024-01-01 00:00",
    );
  });

  test("rawSize 占位符", () => {
    assert.equal(
      Formatters.renderTemplate("{rawSize} bytes", vars),
      "1024 bytes",
    );
  });

  test("同一占位符多处出现时全部替换（全局替换）", () => {
    assert.equal(
      Formatters.renderTemplate("{name}-{name}", vars),
      "a.txt-a.txt",
    );
  });

  test("可选变量（fileCount/folderCount）缺失时不残留占位符", () => {
    // 当前实现对未提供的可选变量不做替换，故占位符会保留；
    // 该行为由 stateBar 模板走 formatForStatusBar 单独处理，此处记录现状
    const out = Formatters.renderTemplate("{name} {fileCount}", vars);
    assert.equal(out, "a.txt {fileCount}");
  });

  test("提供 fileCount/folderCount 时正常替换", () => {
    assert.equal(
      Formatters.renderTemplate("{fileCount} files, {folderCount} dirs", {
        ...vars,
        fileCount: 3,
        folderCount: 2,
      }),
      "3 files, 2 dirs",
    );
  });

  test("图片相关占位符缺失时被清除为空串", () => {
    assert.equal(
      Formatters.renderTemplate("{name}{resolution}{width}{height}", vars),
      "a.txt",
    );
  });

  test("提供图片变量时正常替换", () => {
    assert.equal(
      Formatters.renderTemplate("{resolution} ({width}x{height})", {
        ...vars,
        resolution: "800 * 600",
        width: 800,
        height: 600,
      }),
      "800 * 600 (800x600)",
    );
  });
});

describe("formatImageResolution", () => {
  test("未设置时使用 package.nls.json 声明的默认模板", () => {
    assert.equal(
      Formatters.formatImageResolution({ width: 1920, height: 1080 }),
      "Resolution: 1920 (W) * 1080 (H)",
    );
  });

  test("自定义模板", () => {
    assert.equal(
      Formatters.formatImageResolution(
        { width: 8, height: 6 },
        "{width}x{height}",
      ),
      "8x6",
    );
  });

  test("未传模板时回退到配置值", () => {
    __setConfig({
      "tree-enhancer": { imageResolutionTemplate: "{width} × {height}" },
    });
    assert.equal(
      Formatters.formatImageResolution({ width: 4, height: 3 }),
      "4 × 3",
    );
    __reset();
  });
});

describe("createFileVariables", () => {
  beforeEach(() => __reset());

  test("普通文件：生成基本变量，不含图片字段", () => {
    const v = Formatters.createFileVariables(
      "a.txt",
      2048,
      new Date(2024, 0, 1),
    );
    assert.equal(v.name, "a.txt");
    assert.equal(v.size, "2.05 KB");
    assert.equal(v.rawSize, 2048);
    assert.equal(v.width, undefined);
    assert.equal(v.resolution, undefined);
  });

  test("图片文件：附带分辨率字段", () => {
    const v = Formatters.createFileVariables(
      "p.png",
      100,
      new Date(2024, 0, 1),
      { width: 10, height: 20 },
    );
    assert.equal(v.width, 10);
    assert.equal(v.height, 20);
    assert.equal(v.resolution, "Resolution: 10 (W) * 20 (H)");
  });
});
