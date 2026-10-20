import { describe, expect, it } from "vitest";
import { childState, goalMeta, goalSummary } from "./childState";
import { alignNumericColumns, cellNumeric, numericColumn, splitRow, stripLeadingTitle } from "./reportTables";

describe("childState", () => {
  const live = { running: true };
  const ended = { running: false };

  it("maps resolved and cancelled", () => {
    expect(childState({ id: "t1", status: "resolved" }, live)).toEqual({ state: "resolved", label: "已完成" });
    expect(childState({ id: "t1", status: "cancelled" }, ended)).toEqual({ state: "cancelled", label: "已取消" });
  });

  it("shows 准备中 while running and 待开始 once ended for unassigned tasks", () => {
    const node = { id: "t2", status: "open", agents: [], step_count: 0 };
    expect(childState(node, live).label).toBe("准备中");
    expect(childState(node, ended).label).toBe("待开始");
    expect(childState(node, {}).label).toBe("准备中");
  });

  it("shows 工作中, or 已停止 when the study ended", () => {
    const node = { id: "t3", status: "in_progress", agents: ["a"], step_count: 3 };
    expect(childState(node, live)).toEqual({ state: "working", label: "工作中" });
    expect(childState(node, ended)).toEqual({ state: "cancelled", label: "已停止" });
    const busy = { id: "t4", status: "open", agents: ["a"], live: [{ tool: "bash", label: "x" }] };
    expect(childState(busy, live).state).toBe("working");
  });

  it("falls back to pending for unknown nodes", () => {
    expect(childState(null, ended)).toEqual({ state: "pending", label: "准备中" });
    expect(childState({ id: "t5", status: "open", agents: ["a"], step_count: 2 }, ended).label).toBe("待开始");
  });

  it("summarises the goal", () => {
    expect(goalSummary(live, 2, 5)).toBe("已完成 2 / 5 项任务");
    expect(goalSummary(live, 0, 0)).toBe("正在拆解研究问题");
    expect(goalSummary(ended, 0, 0)).toBe("尚无子任务");
    expect(goalMeta([{ goal: true }, { agents: ["a", "b"] }, { agents: ["a"] }])).toBe("2 个研究智能体");
    expect(goalMeta([{ goal: true }, { agents: [] }])).toBe("等待任务分配");
  });
});

describe("report tables", () => {
  it("detects numeric cells", () => {
    expect(cellNumeric("84142")).toBe(true);
    expect(cellNumeric("-23.3%")).toBe(true);
    expect(cellNumeric("**1.2 万亿**")).toBe(true);
    expect(cellNumeric("新购第二套及以上住房")).toBe(false);
    expect(cellNumeric("")).toBe(false);
  });

  it("skips source and date columns", () => {
    expect(numericColumn("来源", ["2021", "2022"])).toBe(false);
    expect(numericColumn("日期", ["2021-01-01"])).toBe(false);
    expect(numericColumn("时点", ["2021-01-01", "2022-02-02"])).toBe(false);
    expect(numericColumn("税率", ["0.4%-0.6%", "0.5%-1.2%"])).toBe(true);
    expect(numericColumn("城市", ["上海", "重庆"])).toBe(false);
  });

  it("splits rows on unescaped pipes", () => {
    expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b \\| c", "d"]);
    expect(splitRow("a|b")).toEqual(["a", "b"]);
  });

  it("right-aligns numeric columns and keeps explicit alignment", () => {
    const source = ["| 年份 | 城市 | 同比 |", "| --- | :---: | --- |", "| 2020 | 上海 | 15.9% |", "| 2021 | 重庆 | 3.5% |", "", "after"].join("\n");
    const lines = alignNumericColumns(source).split("\n");
    expect(lines[1]).toBe("| ---: | :---: | ---: |");
    expect(lines[5]).toBe("after");
  });

  it("leaves fenced code alone", () => {
    const source = ["```", "| a |", "| --- |", "| 1 |", "```"].join("\n");
    expect(alignNumericColumns(source)).toBe(source);
  });

  it("strips the leading title once", () => {
    expect(stripLeadingTitle("# 问题\n\n## 第一章", "问题")).toBe("## 第一章");
    expect(stripLeadingTitle("# 别的\n\n正文", "问题")).toBe("# 别的\n\n正文");
  });
});
