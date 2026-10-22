import { describe, expect, it } from "vitest";
import type { Snapshot, Step, ViewNode } from "../types/api";
import {
  capNote,
  collectSteps,
  DETAIL_CAP,
  HINT_CAP,
  trajectoryFilename,
  trajectoryJson,
  trajectoryMarkdown,
} from "./trajectory";

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
    status: "resolved",
    notes: "",
    children: [],
    steps: [],
    live: [],
    step_count: 0,
    ...extra,
  };
}

const snapshot: Snapshot = {
  ok: true,
  message: "",
  goal: { id: "goal", title: "地方财政如何转型？" },
  nodes: [
    node("t10", { agents: ["a", "b"], status: "in_progress", step_count: 1, live: [{ tool: "web_search", label: "【查询】x", hint: "q", error: false, count: 1 }] }),
    node("goal", { goal: true, status: "", title: "goal" }),
    node("t2", { step_count: 2 }),
  ],
  edges: [],
  radius: 62,
  report: false,
  running: true,
};

const step = (extra: Partial<Step> = {}): Step => ({ tool: "web_search", label: "【查询】出让收入", error: false, ...extra });

describe("capNote", () => {
  it("flags text at the cap or ending with an ellipsis", () => {
    expect(capNote("x".repeat(DETAIL_CAP), DETAIL_CAP)).toBe("接口只返回前 180 字");
    expect(capNote("x".repeat(HINT_CAP), HINT_CAP)).toBe("接口只返回前 90 字");
    expect(capNote("被截断…", DETAIL_CAP)).toBe("接口只返回前 180 字");
    expect(capNote("cut...", HINT_CAP)).toBe("接口只返回前 90 字");
  });
  it("is quiet for short complete text", () => {
    expect(capNote("short", DETAIL_CAP)).toBeNull();
    expect(capNote("", DETAIL_CAP)).toBeNull();
    expect(capNote(undefined, HINT_CAP)).toBeNull();
    expect(capNote("x".repeat(HINT_CAP - 1), HINT_CAP)).toBeNull();
  });
  it("counts characters, not UTF-16 units", () => {
    expect(capNote("😀".repeat(HINT_CAP - 1), HINT_CAP)).toBeNull();
  });
});

describe("trajectoryMarkdown", () => {
  const at = new Date("2026-10-22T08:00:00Z");
  const steps = {
    t2: [
      step({ hint: "Design Arena", detail: "line one\nline two", count: 3 }),
      step({ tool: "bash", label: "【命令】ls", error: true, detail: "boom" }),
    ],
    t10: [step({ tool: "压缩", label: "【压缩】", hint: undefined })],
  };
  const md = trajectoryMarkdown(snapshot, steps, { exportedAt: at, studyId: "sessions/1/2" });

  it("starts with the question and export time, goal excluded", () => {
    expect(md.startsWith("# 地方财政如何转型？\n\n导出时间：2026-10-22T08:00:00.000Z\n")).toBe(true);
    expect(md).not.toContain("## GOAL");
  });
  it("orders tasks numerically, not lexically", () => {
    expect(md.indexOf("## T2 任务 t2")).toBeGreaterThan(0);
    expect(md.indexOf("## T2 ")).toBeLessThan(md.indexOf("## T10 "));
  });
  it("lists status, agents and numbered steps with fold count, error and multi-line detail", () => {
    expect(md).toContain("- 状态：已完成");
    expect(md).toContain("- Agent：a、b");
    expect(md).toContain("1. 【查询】出让收入 ×3\n   - 工具：搜索 (web_search)\n   - 参数：Design Arena\n   - 结果：line one\n     line two");
    expect(md).toContain("2. 【命令】ls (失败)");
  });
  it("puts live calls last, marked 进行中", () => {
    const t10 = md.slice(md.indexOf("## T10"));
    expect(t10.indexOf("1. 【压缩】")).toBeLessThan(t10.indexOf("2. 【查询】x (进行中)"));
  });
  it("says so when steps were not loaded", () => {
    expect(trajectoryMarkdown(snapshot, {}, { exportedAt: at })).toContain("（工具步骤没有读出来）");
  });
  it("exports one task with `only`", () => {
    const one = trajectoryMarkdown(snapshot, steps, { exportedAt: at, only: "t2" });
    expect(one).toContain("## T2 ");
    expect(one).not.toContain("## T10 ");
  });
});

describe("trajectoryJson / filename", () => {
  it("keeps the raw snapshot and steps", () => {
    const parsed = JSON.parse(trajectoryJson(snapshot, { t2: [step()] }, { exportedAt: new Date(0), studyId: "s" }));
    expect(parsed.snapshot.nodes).toHaveLength(3);
    expect(parsed.steps.t2).toHaveLength(1);
    expect(parsed.exported_at).toBe("1970-01-01T00:00:00.000Z");
  });
  it("replaces slashes with dashes", () => {
    expect(trajectoryFilename("sessions/20261020-120000/1", "md")).toBe("piresearch-sessions-20261020-120000-1-trajectory.md");
    expect(trajectoryFilename("a/b", "json")).toBe("piresearch-a-b-trajectory.json");
  });
});

describe("collectSteps", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);

  it("never runs more than 4 at once and reports progress", async () => {
    let active = 0;
    let peak = 0;
    const progress: number[] = [];
    const result = await collectSteps({
      ids,
      concurrency: 99,
      fetchSteps: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return [step()];
      },
      onProgress: (done) => progress.push(done),
    });
    expect(peak).toBe(4);
    expect(Object.keys(result.steps)).toHaveLength(10);
    expect(progress.at(-1)).toBe(10);
  });

  it("collects failures and keeps going", async () => {
    const result = await collectSteps({
      ids,
      fetchSteps: async (id) => {
        if (id === "t3") throw new Error("x");
        return [];
      },
    });
    expect(result.failed).toEqual(["t3"]);
    expect(Object.keys(result.steps)).toHaveLength(9);
  });

  it("stops when aborted", async () => {
    const abort = new AbortController();
    let calls = 0;
    const result = await collectSteps({
      ids,
      signal: abort.signal,
      fetchSteps: async () => {
        calls += 1;
        abort.abort();
        return [];
      },
    });
    expect(result.cancelled).toBe(true);
    expect(calls).toBeLessThanOrEqual(4);
  });
});
