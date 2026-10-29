import { describe, expect, it } from "vitest";
import type { Edge, Snapshot, ViewNode } from "../../types/api";
import { hexId, mixHex } from "./color";
import { bendOf, edgeGeometry, edgeLabel, parentDepths, spreadEdgeLabels, visibleRelationEdges } from "./edges";
import { estimateChip, chooseGoalTier, estimateCompact, estimateGoalCard, overlaps, placeLabels, type LabelItem } from "./labels";
import { dirOfKey, nextInDirection } from "./nav";
import { summaryFacts, summaryLine } from "./summary";
import { clampPan, fitTransform, focusTransform, MAX_FIT_K, boxRim, nodeBounds, orbRadius, toScreen, zoomAt, zoomLimits } from "./transform";

const nodes = [
  { x: 100, y: 100, radius: 50 },
  { x: 900, y: 500, radius: 60 },
];

describe("transform", () => {
  it("computes node bounds including radii", () => {
    expect(nodeBounds(nodes)).toEqual({ minX: 50, minY: 50, maxX: 960, maxY: 560 });
    expect(nodeBounds([])).toBe(null);
  });

  it("fits bounds centred inside the padded viewport, deterministically", () => {
    const b = nodeBounds(nodes)!;
    const size = { w: 1000, h: 600 };
    const t = fitTransform(b, size, 50);
    expect(t).toEqual(fitTransform(b, size, 50));
    const a = toScreen(t, { x: b.minX, y: b.minY });
    const c = toScreen(t, { x: b.maxX, y: b.maxY });
    expect(a.x).toBeGreaterThanOrEqual(50 - 0.01);
    expect(a.y).toBeGreaterThanOrEqual(50 - 0.01);
    expect(c.x).toBeLessThanOrEqual(950 + 0.01);
    expect(c.y).toBeLessThanOrEqual(550 + 0.01);
    expect((a.x + c.x) / 2).toBeCloseTo(500);
    expect((a.y + c.y) / 2).toBeCloseTo(300);
  });

  it("caps the fit scale for tiny maps", () => {
    const t = fitTransform({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { w: 1000, h: 800 }, 0);
    expect(t.k).toBe(MAX_FIT_K);
  });

  it("zooms around a fixed screen point and respects limits", () => {
    const limits = zoomLimits(0.2);
    const t = { k: 0.2, x: 10, y: 20 };
    const z = zoomAt(t, 0.4, 300, 200, limits);
    expect(z.k).toBeCloseTo(0.4);
    const before = { x: (300 - t.x) / t.k, y: (200 - t.y) / t.k };
    const after = { x: (300 - z.x) / z.k, y: (200 - z.y) / z.k };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(t, 1000, 0, 0, limits).k).toBe(limits.max);
    expect(zoomAt(t, 0.001, 0, 0, limits).k).toBe(limits.min);
  });

  it("keeps part of the map on screen when panned away", () => {
    const b = nodeBounds(nodes)!;
    const size = { w: 800, h: 600 };
    const far = clampPan({ k: 0.5, x: 99999, y: -99999 }, b, size, 100);
    const topLeft = toScreen(far, { x: b.minX, y: b.minY });
    const bottomRight = toScreen(far, { x: b.maxX, y: b.maxY });
    expect(topLeft.x).toBeLessThanOrEqual(800 - 100 + 0.01);
    expect(bottomRight.y).toBeGreaterThanOrEqual(100 - 0.01);
  });

  it("centres a node in the area the panel leaves free", () => {
    const t = focusTransform({ k: 0.5, x: 0, y: 0 }, { x: 400, y: 200 }, { w: 1000, h: 600 }, { right: 400 });
    expect(toScreen(t, { x: 400, y: 200 })).toEqual({ x: 300, y: 300 });
  });

  it("sizes orbs with zoom but never below a readable minimum", () => {
    expect(orbRadius(60, 0.05, false)).toBe(14);
    expect(orbRadius(60, 100, false)).toBe(22);
    expect(orbRadius(60, 100, true)).toBe(20);
    expect(orbRadius(80, 0.25, false)).toBeGreaterThan(orbRadius(40, 0.25, false));
    expect(boxRim(1, 0, 100, 40, 3)).toBe(103);
    expect(boxRim(0, -1, 100, 40)).toBe(40);
  });
});

const edge = (from: string, to: string, relation: Edge["relation"]): Edge => ({ from, to, relation });

describe("edges", () => {
  it("builds a curve that stops at the orb rims", () => {
    const g = edgeGeometry({ x: 0, y: 0 }, { x: 200, y: 0 }, 20, 20, 0.2);
    expect(g.d.startsWith("M")).toBe(true);
    expect(Math.hypot(g.from.x, g.from.y)).toBeCloseTo(20, 0);
    expect(g.mid.y).not.toBe(0);
    expect(g.mid.x).toBeGreaterThan(80);
    expect(g.mid.x).toBeLessThan(120);
  });

  it("bends deterministically within 0..1", () => {
    expect(bendOf("a>b")).toBe(bendOf("a>b"));
    expect(bendOf("a>b")).toBeGreaterThanOrEqual(0);
    expect(bendOf("a>b")).toBeLessThan(1);
  });

  it("measures depth from the goal along parent edges", () => {
    const edges = [edge("goal", "t1", "parent"), edge("t1", "t2", "parent"), edge("t3", "t1", "audit")];
    const depth = parentDepths(["goal", "t1", "t2", "t3"], edges, "goal");
    expect([depth.get("goal"), depth.get("t1"), depth.get("t2")]).toEqual([0, 1, 2]);
    expect(depth.get("t3")).toBe(3);
  });

  it("draws relations on demand: only the active node's edges", () => {
    const edges = [edge("goal", "t1", "parent"), edge("goal", "t2", "parent"), edge("t3", "t1", "audit"), edge("t4", "t2", "error")];
    expect(visibleRelationEdges(edges, null)).toEqual([]);
    expect(visibleRelationEdges(edges, "t1")).toEqual([edges[0], edges[2]]);
  });

  it("labels edges in plain Chinese", () => {
    expect(edgeLabel(edge("a", "b", "fusion"))).toBe("审核");
    expect(edgeLabel(edge("a", "b", "error"))).toBe("指出错误");
    expect(edgeLabel(edge("a", "b", "parent"))).toBe("子任务");
  });
});

function item(id: string, x: number, y: number, extra: Partial<LabelItem> = {}): LabelItem {
  return { id, x, y, r: 14, priority: 100, full: { w: 150, h: 30 }, compact: { w: 34, h: 22 }, ...extra };
}

describe("labels", () => {
  it("estimates labels within the 176px cap, one line of title plus a meta line", () => {
    const small = estimateChip("短标题", "T1 · 未开始");
    expect(small.w).toBeLessThan(120);
    const long = estimateChip("这是一个非常非常长的任务标题需要截断显示出来才可以看清楚的内容", "T12 · 进行中 · 7 次调用");
    expect(long.w).toBeLessThanOrEqual(176);
    expect(long.h).toBe(small.h);
    expect(estimateChip("标题", "T1", { live: "【浏览】化债置换额度" }).h).toBeGreaterThan(small.h);
    expect(estimateCompact("t12").w).toBeLessThan(60);
    expect(estimateGoalCard("短问题").h).toBeLessThan(estimateGoalCard("很长".repeat(40)).h);
    expect(estimateGoalCard("x", 2).h).toBeLessThan(estimateGoalCard("x", 1).h);
  });

  it("keeps labels off obstacles", () => {
    const obstacle = { x: 210, y: 180, w: 200, h: 40 };
    const spots = placeLabels([item("a", 200, 200)], { w: 800, h: 600 }, 6, [obstacle]);
    expect(overlaps(spots.get("a")!.rect, obstacle, 0)).toBe(false);
  });

  it("places non-overlapping labels beside their stars", () => {
    const spots = placeLabels([item("a", 200, 200), item("b", 400, 200), item("c", 200, 400)], { w: 800, h: 600 });
    const rects = [...spots.values()].map((s) => s!.rect);
    expect(rects).toHaveLength(3);
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) expect(overlaps(rects[i]!, rects[j]!, 0)).toBe(false);
    expect([...spots.values()].every((s) => s && !s.compact)).toBe(true);
  });

  it("falls back to compact chips, then hides the lowest priority", () => {
    const crowded = Array.from({ length: 8 }, (_, i) => item(`n${i}`, 300 + (i % 4) * 20, 300 + Math.floor(i / 4) * 14, { priority: 100 - i }));
    const spots = placeLabels(crowded, { w: 700, h: 600 });
    const placed = crowded.map((c) => spots.get(c.id));
    expect(placed[0]).not.toBe(null);
    expect(placed.some((s) => s === null)).toBe(true);
    // The highest priority keeps the full chip.
    expect(placed[0]!.compact).toBe(false);
  });

  it("always shows forced labels in full and hides offscreen ones", () => {
    const items = [item("a", 300, 300, { priority: 1000 }), item("hover", 310, 300, { priority: 1, forced: true }), item("gone", -500, -500)];
    const spots = placeLabels(items, { w: 800, h: 600 });
    expect(spots.get("hover")).not.toBe(null);
    expect(spots.get("hover")!.compact).toBe(false);
    expect(spots.get("gone")).toBe(null);
    // The forced label claims its spot first, so the other label moves away from it.
    expect(overlaps(spots.get("a")!.rect, spots.get("hover")!.rect, 0)).toBe(false);
  });

  it("is deterministic", () => {
    const items = [item("a", 200, 200), item("b", 230, 210), item("c", 260, 190)];
    const a = [...placeLabels(items, { w: 800, h: 600 })];
    const b = [...placeLabels(items, { w: 800, h: 600 })];
    expect(a).toEqual(b);
  });
});

describe("nav", () => {
  const pts = [
    { id: "goal", x: 0, y: 0 },
    { id: "r", x: 100, y: 5 },
    { id: "far", x: 400, y: 0 },
    { id: "d", x: 10, y: 120 },
    { id: "diag", x: 80, y: 90 },
  ];
  it("moves to the nearest star in the pressed direction", () => {
    expect(nextInDirection(pts, "goal", "right")).toBe("r");
    expect(nextInDirection(pts, "goal", "down")).toBe("d");
    expect(nextInDirection(pts, "r", "left")).toBe("goal");
    expect(nextInDirection(pts, "r", "up")).toBe(null);
  });
  it("starts at the first star and reads arrow keys", () => {
    expect(nextInDirection(pts, null, "right")).toBe("goal");
    expect(nextInDirection([], null, "right")).toBe(null);
    expect(dirOfKey("ArrowLeft")).toBe("left");
    expect(dirOfKey("a")).toBe(null);
  });
});

describe("colour", () => {
  it("mixes hex colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#ff0000", 0.3)).toBe("#ff0000");
    expect(hexId("#5D36DC")).toBe("5d36dc");
  });
});

function node(id: string, extra: Partial<ViewNode> = {}): ViewNode {
  return { id, title: id, goal: false, x: 0, y: 0, radius: 60, tone: "green", weight: "node", agents: ["a"], status: "open", notes: "", children: [], steps: [], live: [], ...extra };
}
function snapshot(nodesIn: ViewNode[], edges: Edge[] = [], extra: Partial<Snapshot> = {}): Snapshot {
  return { ok: true, message: "", goal: { id: "goal", title: "问题" }, nodes: nodesIn, edges, radius: 62, report: false, running: true, ...extra };
}

describe("summary", () => {
  const goal = node("goal", { goal: true, agents: [], status: "" });
  const live = { tool: "bash", label: "【命令】x", error: false, count: 1 };
  const think = { tool: "思考", label: "【思考】", error: false, count: 1 };
  it("says what is happening in one line", () => {
    const view = snapshot(
      [goal, node("t1", { status: "resolved" }), node("t2", { status: "in_progress", agents: ["b"], live: [live, think] }), node("t3", { status: "resolved" }), node("t4")],
      [edge("t2", "t1", "error"), edge("t2", "t3", "audit")],
    );
    expect(summaryFacts(view)).toMatchObject({ agents: 2, resolved: 2, total: 4, errors: 0, liveCalls: 1 });
    expect(summaryLine(view)).toBe("2 个智能体在研究 · 2/4 已完成 · 1 个工具调用进行中");
  });
  it("counts open errors and switches wording when finished", () => {
    const view = snapshot([goal, node("t1", { status: "in_progress" }), node("t2", { status: "resolved" })], [edge("t2", "t1", "error")], { running: false });
    expect(summaryLine(view)).toBe("1 个智能体参与了研究 · 1/2 已完成 · 1 处有错误");
  });
  it("handles no tasks", () => {
    expect(summaryLine(snapshot([goal]))).toBe("正在拆解问题，任务马上出现");
    expect(summaryLine(snapshot([goal], [], { running: false }))).toBe("这次研究没有留下任务");
    expect(summaryLine(null)).toBe("这次研究没有留下任务");
  });
});

describe("edge label spreading", () => {
  it("moves a label along its curve when another already sits at the middle", () => {
    const a = edgeGeometry({ x: 0, y: 0 }, { x: 400, y: 0 }, 10, 10, 0);
    const b = edgeGeometry({ x: 0, y: 0 }, { x: 400, y: 0 }, 10, 10, 0);
    const [p, q] = spreadEdgeLabels([a, b]);
    expect(p!.x).toBeCloseTo(200);
    expect(Math.abs(q!.x - p!.x)).toBeGreaterThanOrEqual(64);
  });
});

describe("goal card tiers", () => {
  it("uses the roomiest card that clears the tiles", () => {
    const goal = { x: 400, y: 300 };
    expect(chooseGoalTier("问题", goal, [{ x: 100, y: 100, r: 14 }])).toBe(0);
    expect(chooseGoalTier("很长的问题".repeat(8), goal, [{ x: 400, y: 365, r: 14 }])).toBe(1);
    expect(chooseGoalTier("问题", goal, [{ x: 400, y: 350, r: 14 }])).toBe(2);
    expect(chooseGoalTier("问题", goal, [{ x: 400, y: 330, r: 14 }])).toBe(3);
    expect(chooseGoalTier("问题", goal, [{ x: 400, y: 350, r: 14 }], 1)).toBe(2);
  });
});
