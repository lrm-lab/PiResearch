// Mirrors constellation/test_long_question.mjs.
import { describe, expect, it } from "vitest";
import { headingPane, selectionHeading } from "./heading";

describe("selectionHeading", () => {
  it("a long question has a concise heading and retains the complete original text", () => {
    const original = "分析市场波动。\n\n" + "**要求**：保留每项数据与来源。\n".repeat(300) + "<script>原文</script>";
    const pane = headingPane({ id: "goal", goal: true, title: original });
    expect(pane.heading).toBe("分析市场波动");
    expect(pane.full).toBe(original);
    expect(pane.showPane).toBe(true);
    expect(pane.paneLabel).toBe("完整问题");
  });

  it("headings handle English sentences and emoji without splitting surrogate pairs", () => {
    expect(selectionHeading("First sentence. More requirements.", true)).toBe("First sentence");
    expect(selectionHeading("🚀".repeat(120), true)).toBe("🚀".repeat(100) + "…");
    expect(selectionHeading("普通子任务。保留全部标题。", false)).toBe("普通子任务。保留全部标题。");
  });

  it("strips the task header and markdown heading marks for the goal", () => {
    expect(selectionHeading("# Task\n\n土地财政怎么转型？请给出数据。", true)).toBe("土地财政怎么转型");
    expect(selectionHeading("## 标题\n正文", true)).toBe("标题");
    expect(selectionHeading("v1.2 release notes", true)).toBe("v1.2 release notes");
    expect(selectionHeading("", true)).toBe("");
    expect(selectionHeading(null, false)).toBe("");
  });
});

describe("headingPane", () => {
  it("long node titles can be read in full and step details do not reuse the goal prompt", () => {
    const node = { id: "t1", title: "X".repeat(150) };
    const pane = headingPane(node);
    expect(pane.showPane).toBe(true);
    expect(pane.paneLabel).toBe("完整内容");
    expect(pane.full).toBe(node.title);
    const step = headingPane({ id: "goal", goal: true, title: "主问题" }, { label: "打开来源", tool: "web_fetch" }, 0);
    expect(step.heading).toBe("打开来源");
    expect(step.full).toBe("打开来源");
    expect(step.showPane).toBe(false);
  });

  it("hides the pane for a short single-line task and keys it by node and step", () => {
    const pane = headingPane({ id: "t1", title: "子任务" });
    expect(pane.showPane).toBe(false);
    expect(pane.owner).toBe('["t1",null]');
    expect(headingPane({ id: "t1", title: "子任务" }, { label: "x" }, 2).owner).toBe('["t1",2]');
    expect(headingPane({ id: "goal", goal: true, title: "🚀🚀" }).lengthLabel).toBe("2 字符");
  });
});
