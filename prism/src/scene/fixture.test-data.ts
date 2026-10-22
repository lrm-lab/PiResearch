// Node geometry of the dev fixture `sessions/20261020-120000/1` (31 nodes), for the scene tests.

import type { Edge, NodeStatus, Snapshot, Tone, ViewNode } from "../types/api";

type Row = [id: string, x: number, y: number, radius: number, tone: Tone, status: NodeStatus, steps: number];

const ROWS: Row[] = [
  ["goal", 2194, 2068, 108, "origin", "", 0],
  ["t1", 2497, 2479, 80, "green", "resolved", 15],
  ["t2", 2195, 2435, 64, "cyan", "resolved", 6],
  ["t3", 1986, 2432, 61, "violet", "resolved", 5],
  ["t4", 1852, 2311, 61, "amber", "resolved", 5],
  ["t5", 1859, 1928, 61, "blue", "resolved", 5],
  ["t6", 1939, 1587, 55, "teal", "resolved", 3],
  ["t7", 1791, 1434, 55, "teal", "resolved", 3],
  ["t8", 2251, 1631, 44, "pending", "open", 0],
  ["t9", 2686, 2198, 44, "pending", "open", 0],
  ["t10", 945, 2189, 80, "green", "resolved", 15],
  ["t11", 863, 2424, 80, "green", "resolved", 15],
  ["t12", 1394, 1356, 64, "cyan", "in_progress", 6],
  ["t13", 1252, 1158, 64, "cyan", "in_progress", 6],
  ["t14", 2069, 947, 61, "violet", "resolved", 5],
  ["t15", 2114, 726, 61, "violet", "resolved", 5],
  ["t16", 2768, 1094, 61, "amber", "resolved", 5],
  ["t17", 2952, 933, 61, "amber", "resolved", 5],
  ["t18", 3109, 2586, 61, "blue", "in_progress", 5],
  ["t19", 2210, 3138, 44, "pending", "open", 0],
  ["t20", 778, 2053, 80, "green", "cancelled", 15],
  ["t21", 288, 2192, 80, "green", "in_progress", 15],
  ["t22", 140, 2384, 80, "green", "resolved", 15],
  ["t23", 1061, 792, 64, "cyan", "in_progress", 6],
  ["t24", 2373, 349, 61, "violet", "in_progress", 5],
  ["t25", 3489, 856, 61, "amber", "in_progress", 5],
  ["t26", 158, 1989, 80, "green", "resolved", 15],
  ["t27", 932, 563, 64, "cyan", "open", 6],
  ["t28", 2405, 140, 61, "violet", "open", 5],
  ["t29", 3249, 3350, 44, "pending", "open", 0],
  ["t30", 3678, 722, 61, "amber", "open", 5],
];

export function fixtureNodes(): ViewNode[] {
  return ROWS.map(([id, x, y, radius, tone, status, steps]) => ({
    id,
    title: id === "goal" ? "地方政府土地财政如何转型？" : `任务 ${id}`,
    goal: id === "goal",
    x,
    y,
    radius,
    tone,
    weight: id === "goal" ? "origin" : "node",
    agents: tone === "pending" || tone === "origin" ? [] : [tone],
    status,
    notes: "",
    children: [],
    steps: [],
    live: [],
    step_count: steps,
  }));
}

export const FIXTURE_EDGES: Edge[] = [
  { from: "goal", to: "t1", relation: "parent" },
  { from: "t5", to: "t1", relation: "audit" },
  { from: "t5", to: "t1", relation: "support" },
  { from: "t18", to: "t12", relation: "audit" },
  { from: "t18", to: "t12", relation: "error" },
  { from: "t6", to: "t3", relation: "challenge" },
  { from: "t11", to: "t26", relation: "fusion" },
];

export function fixtureSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ok: true,
    message: "",
    goal: { id: "goal", title: "地方政府土地财政如何转型？" },
    nodes: fixtureNodes(),
    edges: FIXTURE_EDGES,
    radius: 62,
    report: false,
    running: true,
    revision: "r1",
    ...overrides,
  };
}
