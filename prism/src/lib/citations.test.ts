import { describe, expect, it } from "vitest";
import { citationFromHref, citationsToMarkdown, matchHeading, quotedMessage, shortTitle, trimOpenCitation } from "./citations";

describe("citations", () => {
  it("turns 【§…】 into cite links", () => {
    const md = citationsToMarkdown("见【§ 市场  规模 】和【§A[1]】。");
    expect(md).toBe("见[市场 规模](cite:%E5%B8%82%E5%9C%BA%20%E8%A7%84%E6%A8%A1)和[A1](cite:A%5B1%5D)。");
    expect(citationFromHref("cite:%E5%B8%82%E5%9C%BA%20%E8%A7%84%E6%A8%A1")).toBe("市场 规模");
    expect(citationFromHref("https://a.b")).toBeNull();
  });

  it("hides an unfinished citation while streaming", () => {
    expect(trimOpenCitation("结论见【§市场规")).toBe("结论见");
    expect(trimOpenCitation("结论见【§市场】，另")).toBe("结论见【§市场】，另");
  });

  it("truncates long titles", () => {
    expect(shortTitle("短标题")).toBe("短标题");
    expect(shortTitle("一二三四五六七八九十一二三四五六七八九十")).toBe("一二三四五六七八九十一二三四五六七八…");
  });

  it("matches headings exact, then prefix, then substring", () => {
    const headings = ["一、背景", "二、市场规模与增长", "市场规模", "三、 风险  与 对策"];
    expect(matchHeading(headings, "市场规模")).toBe(2);
    expect(matchHeading(headings, "二、市场规模")).toBe(1);
    expect(matchHeading(headings, "风险 与 对策")).toBe(3);
    expect(matchHeading(headings, "增长")).toBe(1);
    expect(matchHeading(headings, "不存在")).toBe(-1);
    expect(matchHeading(headings, "  ")).toBe(-1);
  });

  it("finds headings the reader renamed", () => {
    expect(matchHeading(["证据核对", "完整性", "正确性"], "Correctness Check")).toBe(2);
    expect(matchHeading(["证据核对"], "Correctness Check")).toBe(-1);
  });

  it("quotes a selection, trimmed to 600 characters", () => {
    expect(quotedMessage(null, "问题")).toBe("问题");
    expect(quotedMessage(" 第一行\n第二行 ", "为什么？")).toBe("> 第一行\n> 第二行\n\n为什么？");
    expect(quotedMessage("字".repeat(700), "q")).toBe(`> ${"字".repeat(600)}\n\nq`);
  });
});
