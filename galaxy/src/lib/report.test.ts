import { describe, expect, it } from "vitest";
import { chapterTitle, cleanChapter, cleanEvidenceLine, prepareUserReport, scopeLede } from "./report";

const block = (status: string, body: string) => `<report status="${status}">\n${body}\n</report>`;

const findings = [
  "Scope: 研究土地出让收入的年度变化，采用财政部口径。",
  "Findings:",
  "**1. 出让收入连续下降**",
  "2021 年为 87051 亿元 quality: high（官方）。",
  "",
  "| 年份 | 收入（亿元） |",
  "| --- | ---: |",
  "| 2021 | 87051 |",
  "| 2022 | 66854 |",
  "",
  "Evidence:",
  "- https://www.mof.gov.cn/a — 财政部公告 quality: high",
  "- /Users/frank/secret.md — 本地笔记",
  "Confidence: 高",
  "Unresolved:",
  "- 2025 年数据尚未公布",
  "Disconfirming: 无",
  "Conflicts: 统计口径存在差异",
  "[NOTE: internal] ",
].join("\n");

describe("cleanChapter", () => {
  const chapter = cleanChapter(findings);

  it("derives the title and lede from Scope", () => {
    expect(chapterTitle(findings)).toBe("土地出让收入的年度变化");
    expect(scopeLede(findings)).toBe("研究土地出让收入的年度变化。");
    expect(chapter.startsWith("## 土地出让收入的年度变化\n\n研究土地出让收入的年度变化。\n\n")).toBe(true);
  });

  it("maps English section headings to Chinese", () => {
    expect(chapter).toContain("### 1. 出让收入连续下降");
    expect(chapter).toContain("### 来源");
    expect(chapter).toContain("> **判断** 高");
    expect(chapter).toContain("### 尚未确认");
    expect(chapter).toContain("> **相反证据** 无");
    expect(chapter).toContain("> **分歧** 统计口径存在差异");
    expect(chapter).not.toMatch(/Scope:|Findings:|Evidence:|Confidence:|quality:|\[NOTE:/);
  });

  it("keeps GFM tables and links evidence, dropping local paths", () => {
    expect(chapter).toContain("| 2021 | 87051 |");
    expect(chapter).toContain("- [财政部公告](https://www.mof.gov.cn/a)");
    expect(chapter).not.toContain("/Users/");
  });

  it("maps the check sections and titles them 证据核对", () => {
    const check = cleanChapter("## Completeness Check\n全部覆盖\n## Correctness Check\n无误\n## Precision Issues\n无\n## Discipline Issues (style)\n无\n## Deliverable Check\n已交付");
    expect(check.split("\n")[0]).toBe("## 证据核对");
    for (const heading of ["### 完整性", "### 正确性", "### 精度", "### 写法", "### 交付"]) expect(check).toContain(heading);
  });

  it("drops short NOTE-only blocks and empty input", () => {
    expect(cleanChapter("[NOTE: nothing found]")).toBe("");
    expect(cleanChapter("")).toBe("");
    expect(cleanChapter(null)).toBe("");
  });
});

describe("cleanEvidenceLine", () => {
  it("splits joined evidence URLs", () => {
    expect(cleanEvidenceLine("- https://a.cn/x 与 https://b.cn/y — 两个来源")).toBe("- [两个来源](https://a.cn/x)\n- [两个来源](https://b.cn/y)");
    expect(cleanEvidenceLine("普通一行")).toBe("普通一行");
    expect(cleanEvidenceLine("见 sandbox/worktree/a.md")).toBeNull();
  });
});

describe("prepareUserReport", () => {
  it("keeps complete blocks, skips incomplete ones and prefixes the heading", () => {
    const source = [
      "# Report",
      block("complete", findings),
      block("incomplete", "Scope: 未完成的草稿章节内容\nFindings:\n草稿"),
      block("complete", "**2. 房产税试点**\n上海、重庆试点。\n# 内部标题"),
    ].join("\n\n");
    const out = prepareUserReport(source, "土地财政怎么转型");
    expect(out.startsWith("# 土地财政怎么转型\n\n## 土地出让收入的年度变化")).toBe(true);
    expect(out).toContain("## 房产税试点");
    expect(out).toContain("## 内部标题");
    expect(out).not.toContain("草稿");
    expect(out.match(/^# /gm)).toHaveLength(1);
  });

  it("omits the heading when it is a placeholder", () => {
    expect(prepareUserReport(block("complete", "**1. 甲**\n正文"), "正在读取").startsWith("## 甲")).toBe(true);
    expect(prepareUserReport(block("complete", "**1. 甲**\n正文"), "这份运行没有星图").startsWith("## 甲")).toBe(true);
  });

  it("falls back to the raw report without blocks, stripping the best-effort preamble", () => {
    expect(prepareUserReport("# 结论\n\n土地出让收入下降。\n", "问题")).toBe("# 结论\n\n土地出让收入下降。");
    expect(prepareUserReport("## Best-effort collected results\nraw dump\n# 结论\n正文", "问题")).toBe("# 结论\n正文");
    expect(prepareUserReport("a\r\nb", "")).toBe("a\nb");
  });

  it("treats a block without status as kept", () => {
    expect(prepareUserReport("<report>\n**1. 甲**\n正文\n</report>", "")).toBe("## 甲\n\n正文");
  });
});
