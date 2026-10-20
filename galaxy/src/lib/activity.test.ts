// Mirrors constellation/test_goal_activity.mjs, plus the label helpers.
import { describe, expect, it } from "vitest";
import { ariaLabel, awaitingAgent, goalActivity, liveKey, phaseLabel, stateText, toolCount } from "./activity";

const completed = {
  ok: true,
  version: 6,
  running: true,
  nodes: [
    { id: "goal", goal: true },
    { id: "t1", status: "resolved", live: [] },
    { id: "t2", status: "resolved", live: [] },
  ],
};

describe("goalActivity / liveKey (test_goal_activity.mjs)", () => {
  it("the goal stays active while all completed tasks wait for the final report phase", () => {
    const activity = goalActivity(completed);
    expect(activity?.phase).toBe("finalizing");
    expect(activity?.label).toBe("整理报告中");
  });

  it("finished or failed runs never animate even when graph version is unchanged", () => {
    const finished = { ...completed, running: false };
    expect(goalActivity(finished)).toBeNull();
    expect(liveKey(completed)).not.toBe(liveKey(finished));
    expect(finished.version).toBe(completed.version);
  });

  it("unfinished or still active children do not trigger report finalization", () => {
    for (const status of ["open", "in_progress"]) {
      const source = { ...completed, nodes: [completed.nodes[0]!, { id: "t1", status, live: [] }] };
      expect(goalActivity(source)).toBeNull();
      expect(liveKey(completed)).not.toBe(liveKey(source));
    }
    const active = {
      ...completed,
      nodes: [completed.nodes[0]!, { id: "t1", status: "resolved", live: [{ label: "【检查】报告", tool: "bash" }] }],
    };
    expect(goalActivity(active)).toBeNull();
  });

  it("cancelled tasks use a neutral summary label and startup retains planning", () => {
    const cancelled = { ...completed, nodes: [completed.nodes[0]!, { id: "t1", status: "cancelled", live: [] }] };
    expect(goalActivity(cancelled)?.label).toBe("汇总结果中");
    expect(goalActivity({ ...completed, nodes: [completed.nodes[0]!] })?.phase).toBe("planning");
    expect(goalActivity({ ...completed, running: undefined })).toBeNull();
    expect(goalActivity({ ...completed, ok: false })).toBeNull();
  });

  it("liveKey has the 2D format", () => {
    const key = liveKey({
      running: true,
      nodes: [{ id: "t1", status: "in_progress", steps_revision: "abc", step_count: 3, live: [{ label: "a", tool: "bash" }, { label: "b", tool: "bash" }] }],
    });
    expect(key).toBe("true:t1:in_progress:abc:3:a/b");
    expect(liveKey(null)).toBe("null:");
    expect(liveKey({ nodes: [{ id: "g" }] })).toBe("undefined:g::::");
  });
});

describe("phaseLabel", () => {
  it("reads 调研中 while running without a goal phase", () => {
    expect(phaseLabel({ ...completed, nodes: [completed.nodes[0]!, { id: "t1", status: "in_progress", live: [] }] })).toBe("调研中");
  });
  it("reads 已结束 when not running, or when running is absent", () => {
    expect(phaseLabel({ ...completed, running: false })).toBe("已结束");
    expect(phaseLabel({ ...completed, running: undefined })).toBe("已结束");
    expect(phaseLabel(null)).toBe("已结束");
  });
  it("uses the goal activity label otherwise", () => {
    expect(phaseLabel(completed)).toBe("整理报告中");
    expect(phaseLabel({ ok: true, running: true, nodes: [{ id: "goal", goal: true }] })).toBe("拆解问题中");
  });
});

describe("node state helpers", () => {
  const view = {
    ok: true,
    running: true,
    nodes: [
      { id: "goal", goal: true, title: "主问题" },
      { id: "t1", status: "resolved", agents: ["a"], step_count: 3, live: [], title: "甲" },
      { id: "t2", status: "in_progress", agents: ["a"], step_count: 3, live: [{ tool: "bash", label: "【执行】x" }, { tool: "思考", label: "【思考】" }], title: "乙" },
      { id: "t3", status: "open", agents: [], step_count: 0, live: [], title: "丙" },
      { id: "t4", status: "cancelled", agents: ["b"], step_count: 0, live: [], title: "丁" },
    ],
    edges: [{ from: "t4", to: "t2", relation: "error" }],
  };
  const at = (index: number) => view.nodes[index]!;
  const [goal, t1, t2, t3, t4] = [at(0), at(1), at(2), at(3), at(4)];

  it("counts live calls except 思考", () => {
    expect(toolCount(t2)).toBe(4);
    expect(toolCount({ id: "x", steps: [{ tool: "bash", label: "a", error: false }] })).toBe(1);
  });

  it("detects tasks awaiting an agent", () => {
    expect(awaitingAgent(t3)).toBe(true);
    expect(awaitingAgent(t1)).toBe(false);
    expect(awaitingAgent(goal)).toBe(false);
  });

  it("matches the 2D tab text", () => {
    expect(stateText(view, goal)).toBe("调研中");
    expect(stateText(view, t1)).toBe("已完成");
    expect(stateText(view, t2)).toBe("存在错误");
    expect(stateText(view, t3)).toBe("待分配");
    expect(stateText(view, t4)).toBe("已取消");
    expect(stateText(view, { id: "t9", status: "weird", agents: ["c"], step_count: 1 })).toBe("研究任务");
  });

  it("builds aria labels", () => {
    expect(ariaLabel(view, goal)).toBe("主问题，调研中，1 项任务已完成，共 4 项");
    expect(ariaLabel(view, t2)).toBe("乙，存在错误，4 次工具调用");
  });
});
