import { describe, expect, it } from "vitest";
import type { Edge } from "../types/api";
import { bodyRadius, hash01, liftLayout, parentDepths, type SpaceInputNode } from "./space";

const TITLE = "土地财政怎么转型？请给出2020-2025年出让收入数据。";
const nodes: SpaceInputNode[] = [
  { id: "goal", goal: true, x: 731.7, y: 820.6, radius: 86.5, agents: [] },
  { id: "t1", x: 848.9, y: 428.5, radius: 55.4, agents: ["land"] },
  { id: "t2", x: 140, y: 140, radius: 58.5, agents: ["land"] },
  { id: "t3", x: 1200.1, y: 960.1, radius: 44, agents: [] },
  { id: "t4", x: 315.7, y: 1177.9, radius: 48.2, agents: ["fact_verifier"] },
  { id: "t5", x: 361.7, y: 741.1, radius: 44, agents: ["sample_challenger"] },
  { id: "t9", x: 500, y: 500, radius: 44, agents: ["orphan"] },
];
const edges: Edge[] = [
  { from: "goal", to: "t1", relation: "parent" },
  { from: "t1", to: "t2", relation: "parent" },
  { from: "goal", to: "t3", relation: "parent" },
  { from: "goal", to: "t4", relation: "parent" },
  { from: "goal", to: "t5", relation: "parent" },
  { from: "t4", to: "t1", relation: "audit" },
  { from: "t4", to: "t1", relation: "support" },
  { from: "t5", to: "t2", relation: "challenge" },
  { from: "t5", to: "t2", relation: "error" },
];

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function plain(map: Map<string, unknown>) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

describe("hash01", () => {
  it("is FNV-1a 32-bit mapped to [0,1)", () => {
    // Reference values of FNV-1a 32: "" -> 0x811c9dc5, "a" -> 0xe40c292c.
    expect(hash01("")).toBe(0x811c9dc5 / 2 ** 32);
    expect(hash01("a")).toBe(0xe40c292c / 2 ** 32);
    for (const text of ["t1", "土地|land", "🚀"]) {
      const value = hash01(text);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hash01(text)).toBe(value);
    }
  });
});

describe("liftLayout", () => {
  const lifted = liftLayout(nodes, edges, TITLE);

  it("puts the goal at the origin with the goal radius formula", () => {
    const goal = lifted.get("goal")!;
    expect([goal.x, goal.y, goal.z, goal.depth]).toEqual([0, 0, 0, 0]);
    expect(goal.r).toBeCloseTo(0.55 + 0.004 * 86.5, 12);
  });

  it("follows the DESIGN.md formulas for tasks", () => {
    const t2 = lifted.get("t2")!;
    expect(t2.x).toBeCloseTo((140 - 731.7) / 100, 12);
    expect(t2.z).toBeCloseTo((140 - 820.6) / 100, 12);
    expect(t2.depth).toBe(2);
    const y = -0.35 * (2 - 1) + 0.9 * (hash01(`${TITLE}|land`) - 0.5) + 0.25 * (hash01("t2") - 0.5);
    expect(t2.y).toBeCloseTo(y, 12);
    expect(t2.r).toBeCloseTo(0.12 + 0.0045 * 58.5, 12);
    // No agent: the cluster key is the node id.
    const t3 = lifted.get("t3")!;
    expect(t3.y).toBeCloseTo(0.9 * (hash01(`${TITLE}|t3`) - 0.5) + 0.25 * (hash01("t3") - 0.5), 12);
  });

  it("is deterministic and independent of node and edge order", () => {
    const again = plain(liftLayout(nodes, edges, TITLE));
    expect(again).toEqual(plain(lifted));
    for (let seed = 1; seed < 8; seed += 1) {
      expect(plain(liftLayout(shuffled(nodes, seed), shuffled(edges, seed * 31), TITLE))).toEqual(plain(lifted));
    }
  });

  it("is seeded by the question", () => {
    const other = liftLayout(nodes, edges, "另一个问题");
    expect(other.get("t1")!.y).not.toBeCloseTo(lifted.get("t1")!.y, 6);
    expect(other.get("t1")!.x).toBe(lifted.get("t1")!.x);
  });

  it("keeps an agent cluster on a shared thickness band", () => {
    const t1 = lifted.get("t1")!;
    const t2 = lifted.get("t2")!;
    // Same cluster term; the difference is depth plus the small id jitter.
    expect(Math.abs(t2.y + 0.35 - t1.y)).toBeLessThanOrEqual(0.25);
  });

  it("ignores status-like fields", () => {
    const decorated = nodes.map((node) => ({ ...node, status: "resolved", step_count: 99 }));
    expect(plain(liftLayout(decorated, edges, TITLE))).toEqual(plain(lifted));
  });

  it("handles empty input and a missing goal", () => {
    expect(liftLayout([], [], TITLE).size).toBe(0);
    const noGoal = liftLayout(nodes.filter((node) => !node.goal), [], TITLE);
    expect(noGoal.size).toBe(nodes.length - 1);
    for (const point of noGoal.values()) expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
  });
});

describe("parentDepths", () => {
  it("gives unreachable tasks depth 1 and survives cycles", () => {
    const depths = parentDepths(nodes, [...edges, { from: "t2", to: "t1", relation: "parent" }], "goal");
    expect(depths.get("t9")).toBe(1);
    expect(depths.get("t1")).toBe(1);
    expect(depths.get("t2")).toBe(2);
  });
});

describe("bodyRadius", () => {
  it("grows with the 2D radius", () => {
    expect(bodyRadius(44, false)).toBeCloseTo(0.318, 12);
    expect(bodyRadius(124, false)).toBeGreaterThan(bodyRadius(44, false));
  });
});
