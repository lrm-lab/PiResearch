import { describe, expect, it } from "vitest";
import { CITE_PREFIX, findHeading, linkCitations, parseSse, withQuote } from "./chat";

describe("parseSse", () => {
  it("returns complete events, skips comments and keeps the unfinished tail", () => {
    const { events, rest } = parseSse('event: delta\ndata: {"text":"你"}\n\n: ping\n\nevent: done\ndata: {"message":{"role":"assistant","content":"你好"}}\n\nevent: del');
    expect(events).toEqual([
      { event: "delta", data: { text: "你" } },
      { event: "done", data: { message: { role: "assistant", content: "你好" } } },
    ]);
    expect(rest).toBe("event: del");
  });
});

describe("citations", () => {
  it("turn 【§标题】 into chip links", () => {
    expect(linkCitations("见顶【§1. 出让收入】。")).toBe(`见顶[1. 出让收入](${CITE_PREFIX}${encodeURIComponent("1. 出让收入")})。`);
  });

  it("find the heading by exact text, ignoring numbering and spaces, then by containment", () => {
    const headings = [{ textContent: "0. 摘要" }, { textContent: "1. 出让收入的变化" }, { textContent: "2.1 分省差异" }];
    expect(findHeading(headings, "1. 出让收入的变化")).toBe(headings[1]);
    expect(findHeading(headings, "分省差异")).toBe(headings[2]);
    expect(findHeading(headings, "出让收入")).toBe(headings[1]);
    expect(findHeading(headings, "城投债务")).toBeNull();
  });
});

it("quotes a passage above the question", () => {
  expect(withQuote("  出让收入\n连续下降 ", "为什么？")).toBe("> 出让收入 连续下降\n\n为什么？");
  expect(withQuote("", "为什么？")).toBe("为什么？");
});
