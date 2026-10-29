import { describe, expect, it } from "vitest";
import type { Edge, Snapshot, ViewNode } from "../types/api";
import {
  agentRoster,
  groupTasks,
  isVisible,
  keyAction,
  listOrder,
  progressSegments,
  readingMeta,
  relationCounts,
  relationsOf,
  searchWithTab,
  stepSelection,
  tabFromSearch,
  toneCounts,
  visibleTasks,
} from "./model";
import { alignNumericColumns, cellNumeric, numericColumn, splitRow, stripLeadingTitle } from "./reportTables";

function node(id: string, extra: Partial<ViewNode> = {}): ViewNode {
  return {
    id,
    title: `任务 ${id}`,
    goal: false,
    x: 0,
    y: 0,
    radius: 60,
    tone: "green",
    weight: "node",
    agents: ["fiscal"],
    status: "open",
    notes: "",
    children: [],
    steps: [],
    live: [],
    ...extra,
  };
}

function snapshot(nodes: ViewNode[], edges: Edge[] = []): Snapshot {
  return { ok: true, message: "", goal: { id: "goal", title: "问题" }, nodes, edges, radius: 62, report: true };
}

const view = snapshot(
  [
    node("goal", { goal: true, agents: [], status: "", tone: "origin", title: "问题" }),
    node("t10", { status: "resolved", agents: ["fiscal"] }),
    node("t2", { status: "in_progress", agents: ["property"], tone: "cyan" }),
    node("t1", { status: "resolved", agents: ["fiscal"] }),
    node("t3", { status: "open", agents: [], tone: "pending" }),
    node("t4", { status: "cancelled", agents: ["fiscal"] }),
    node("t5", { status: "in_progress", agents: ["verifier"], tone: "blue" }),
  ],
  [
    { from: "goal", to: "t1", relation: "parent" },
    { from: "t1", to: "t10", relation: "parent" },
    { from: "t5", to: "t1", relation: "audit" },
    { from: "t5", to: "t1", relation: "support" },
    { from: "t5", to: "t2", relation: "audit" },
    { from: "t5", to: "t2", relation: "error" },
    { from: "t5", to: "t2", relation: "fusion" },
  ],
);

describe("tasks", () => {
  it("groups by status in reading order and keeps task order inside groups", () => {
    const groups = groupTasks(visibleTasks(view, {}));
    expect(groups.map((group) => group.label)).toEqual(["进行中", "未开始", "已完成", "已取消"]);
    expect(groups[0]!.items.map((item) => item.id)).toEqual(["t2", "t5"]);
    expect(groups[2]!.items.map((item) => item.id)).toEqual(["t1", "t10"]);
    expect(listOrder(visibleTasks(view, {}))).toEqual(["t2", "t5", "t3", "t1", "t10", "t4"]);
  });

  it("hides a task only when all of its agents are hidden", () => {
    expect(isVisible({ agents: [] }, { fiscal: true })).toBe(true);
    expect(isVisible({ agents: ["fiscal", "debt"] }, { fiscal: true })).toBe(true);
    expect(isVisible({ agents: ["fiscal"] }, { fiscal: true })).toBe(false);
    expect(visibleTasks(view, { fiscal: true }).map((item) => item.id)).toEqual(["t2", "t3", "t5"]);
  });

  it("steps the selection with wrap-around", () => {
    const order = ["a", "b", "c"];
    expect(stepSelection(order, null, 1)).toBe("a");
    expect(stepSelection(order, null, -1)).toBe("c");
    expect(stepSelection(order, "c", 1)).toBe("a");
    expect(stepSelection(order, "a", -1)).toBe("c");
    expect(stepSelection(order, "gone", 1)).toBe("a");
    expect(stepSelection([], "a", 1)).toBe(null);
  });

  it("counts tones with the error edge winning over in progress", () => {
    const counts = toneCounts(view, visibleTasks(view, {}));
    expect(counts).toMatchObject({ progress: 1, error: 1, done: 2, todo: 1, closed: 1 });
    expect(progressSegments(view)).toEqual([
      { tone: "done", count: 2 },
      { tone: "progress", count: 1 },
      { tone: "error", count: 1 },
      { tone: "todo", count: 1 },
      { tone: "closed", count: 1 },
    ]);
  });

  it("builds the agent roster in task order", () => {
    expect(agentRoster(view)).toEqual([
      { agent: "fiscal", tone: "green", tasks: 3, resolved: 2, active: 0 },
      { agent: "property", tone: "cyan", tasks: 1, resolved: 0, active: 1 },
      { agent: "verifier", tone: "blue", tasks: 1, resolved: 0, active: 1 },
    ]);
  });
});

describe("relations", () => {
  it("lists the parent and verification links, collapsing fusion into audit", () => {
    expect(relationsOf(view, "t2").map((link) => [link.phrase, link.other])).toEqual([
      ["被审核", "t5"],
      ["被指出错误", "t5"],
    ]);
    expect(relationsOf(view, "t1").map((link) => [link.phrase, link.title])).toEqual([
      ["上级任务", "研究主问题"],
      ["被审核", "任务 t5"],
      ["被支持", "任务 t5"],
    ]);
    expect(relationsOf(view, "t5").map((link) => [link.phrase, link.other])).toEqual([
      ["审核", "t1"],
      ["审核", "t2"],
      ["支持", "t1"],
      ["指出错误", "t2"],
    ]);
  });

  it("counts verification edges per relation for row badges", () => {
    expect(relationCounts(view.edges, "t2")).toEqual([
      { relation: "audit", count: 2 },
      { relation: "error", count: 1 },
    ]);
    expect(relationCounts(view.edges, "t10")).toEqual([]);
  });
});

describe("keyAction", () => {
  const map = { tab: "map" as const, hasReport: true };

  it("maps the page shortcuts", () => {
    expect(keyAction({ key: "F" }, map)).toEqual({ kind: "fit" });
    expect(keyAction({ key: "?" }, map)).toEqual({ kind: "help" });
    expect(keyAction({ key: "Escape" }, map)).toEqual({ kind: "escape" });
    expect(keyAction({ key: "2" }, map)).toEqual({ kind: "tab", tab: "tasks" });
    expect(keyAction({ key: "3" }, map)).toEqual({ kind: "tab", tab: "report" });
  });

  it("ignores typing, IME composition, modifiers and repeats", () => {
    expect(keyAction({ key: "v", typing: true }, map)).toBe(null);
    expect(keyAction({ key: "v", isComposing: true }, map)).toBe(null);
    expect(keyAction({ key: "v", metaKey: true }, map)).toBe(null);
    expect(keyAction({ key: "v", repeat: true }, map)).toBe(null);
    expect(keyAction({ key: "Escape", defaultPrevented: true }, map)).toBe(null);
  });

  it("respects the tab and the report", () => {
    expect(keyAction({ key: "3" }, { ...map, hasReport: false })).toBe(null);
    expect(keyAction({ key: "f" }, { ...map, tab: "tasks" })).toBe(null);
    expect(keyAction({ key: "v" }, { ...map, tab: "report" })).toBe(null);
    expect(keyAction({ key: "ArrowDown" }, map)).toBe(null);
    expect(keyAction({ key: "ArrowDown" }, { ...map, tab: "tasks" })).toEqual({ kind: "step", delta: 1 });
    expect(keyAction({ key: "ArrowUp", repeat: true }, { ...map, tab: "tasks" })).toEqual({ kind: "step", delta: -1 });
    expect(keyAction({ key: "k" }, { ...map, tab: "tasks" })).toEqual({ kind: "step", delta: -1 });
  });
});

describe("url", () => {
  it("reads and writes the tab, keeping other parameters", () => {
    expect(tabFromSearch("?tab=report&theme=dark")).toBe("report");
    expect(tabFromSearch("?tab=nope")).toBe(null);
    expect(searchWithTab("?theme=dark", "tasks", "map")).toBe("?theme=dark&tab=tasks");
    expect(searchWithTab("?tab=tasks&theme=dark", "map", "map")).toBe("?theme=dark");
    expect(searchWithTab("?tab=report", "tasks", "tasks")).toBe("");
  });
});

describe("report", () => {
  it("estimates reading time", () => {
    expect(readingMeta("## 一\n\n正文\n\n## 二\n\n正文")).toBe("2 章 · 约 1 分钟");
    expect(readingMeta("短")).toBe("约 1 分钟");
    expect(readingMeta("字".repeat(1800))).toBe("约 4 分钟");
  });

  it("detects numeric cells and columns", () => {
    expect(cellNumeric("84142")).toBe(true);
    expect(cellNumeric("-23.3%")).toBe(true);
    expect(cellNumeric("新购第二套及以上住房")).toBe(false);
    expect(numericColumn("来源", ["2021", "2022"])).toBe(false);
    expect(numericColumn("税率", ["0.4%-0.6%", "0.5%-1.2%"])).toBe(true);
    expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b \\| c", "d"]);
  });

  it("right-aligns numeric columns, keeps explicit alignment and fenced code", () => {
    const source = ["| 年份 | 城市 | 同比 |", "| --- | :---: | --- |", "| 2020 | 上海 | 15.9% |", "| 2021 | 重庆 | 3.5% |"].join("\n");
    expect(alignNumericColumns(source).split("\n")[1]).toBe("| ---: | :---: | ---: |");
    const fenced = ["```", "| a |", "| --- |", "| 1 |", "```"].join("\n");
    expect(alignNumericColumns(fenced)).toBe(fenced);
  });

  it("strips the leading title once", () => {
    expect(stripLeadingTitle("# 问题\n\n## 第一章", "问题")).toBe("## 第一章");
    expect(stripLeadingTitle("# 别的\n\n正文", "问题")).toBe("# 别的\n\n正文");
  });
});
