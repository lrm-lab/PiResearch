import { describe, expect, it } from "vitest";
import { fixtureNodes } from "./fixture.test-data";
import {
  buildLayout,
  CARD_ASPECT,
  CARD_BASE_W,
  cardScale,
  footprint,
  GAP,
  layoutScale,
  MAX_SHEETS,
  overlaps,
  pairScale,
  S_DEFAULT,
  S_MAX,
  sheetCount,
  stackHeight,
} from "./layout";

describe("layout", () => {
  it("never overlaps two footprints in the fixture, with at least a 15% gap", () => {
    const layout = buildLayout({ nodes: fixtureNodes() });
    const list = [...layout.nodes.values()];
    expect(list).toHaveLength(31);
    let tightest = Infinity;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        expect(overlaps(a, b)).toBe(false);
        // Separation ratio on the better axis: ≥ GAP.
        const rx = Math.abs(a.x - b.x) / ((a.w + b.w) / 2);
        const rz = Math.abs(a.z - b.z) / ((a.d + b.d) / 2);
        tightest = Math.min(tightest, Math.max(rx, rz));
      }
    }
    expect(tightest).toBeGreaterThanOrEqual(GAP - 1e-9);
    // Compaction packs the desk: the tightest pair sits close to the gap.
    expect(tightest).toBeLessThan(GAP + 0.3);
  });

  it("puts the goal at the origin and keeps the 2D orientation (y down → +z)", () => {
    const layout = buildLayout({ nodes: fixtureNodes() });
    const goal = layout.nodes.get("goal")!;
    expect(goal.x).toBe(0);
    expect(goal.z).toBe(0);
    const t19 = layout.nodes.get("t19")!; // below the goal in 2D
    expect(t19.z).toBeGreaterThan(0);
    const t21 = layout.nodes.get("t21")!; // left of the goal
    expect(t21.x).toBeLessThan(0);
    expect(layout.radius).toBeGreaterThan(Math.hypot(t21.x, t21.z));
  });

  it("positions depend only on geometry, not on status", () => {
    const a = buildLayout({ nodes: fixtureNodes() });
    const changed = fixtureNodes().map((node) => ({ ...node, status: "resolved" as const, live: [] }));
    const b = buildLayout({ nodes: changed });
    for (const [id, node] of a.nodes) {
      expect(b.nodes.get(id)!.x).toBe(node.x);
      expect(b.nodes.get(id)!.z).toBe(node.z);
    }
  });

  it("card size follows the radius within ±10% and keeps the face aspect", () => {
    expect(cardScale(44)).toBeCloseTo(0.9);
    expect(cardScale(120)).toBeCloseTo(1.1);
    expect(cardScale(500)).toBeCloseTo(1.1);
    expect(cardScale(Number.NaN)).toBeCloseTo(0.9);
    const f = footprint({ goal: false, radius: 82 });
    expect(f.w / f.d).toBeCloseTo(CARD_ASPECT);
    expect(f.w).toBeCloseTo(CARD_BASE_W);
  });

  it("pair scale separates on the easier axis", () => {
    const a = { x: 0, y: 0, w: 1, d: 1 };
    // Straight below: only z can separate.
    expect(pairScale(a, { x: 0, y: 100, w: 1, d: 1 })).toBeCloseTo(GAP / 100);
    // Diagonal: the larger offset wins (smaller scale).
    expect(pairScale(a, { x: 200, y: 100, w: 1, d: 1 })).toBeCloseTo(GAP / 200);
    expect(pairScale(a, { x: 0, y: 0, w: 1, d: 1 })).toBe(Infinity);
  });

  it("handles empty, single and coincident layouts", () => {
    expect(layoutScale([])).toBe(S_DEFAULT);
    const empty = buildLayout(null);
    expect(empty.nodes.size).toBe(0);
    expect(empty.radius).toBeGreaterThan(0);
    const one = buildLayout({ nodes: fixtureNodes().slice(0, 1) });
    expect(one.scale).toBe(S_DEFAULT);
    const twins = fixtureNodes().slice(1, 3).map((node) => ({ ...node, x: 100, y: 100 }));
    expect(layoutScale(twins)).toBe(S_DEFAULT);
    const close = fixtureNodes().slice(1, 3);
    close[1] = { ...close[1]!, x: close[0]!.x + 1, y: close[0]!.y };
    expect(layoutScale(close)).toBe(S_MAX);
  });

  it("never shrinks below the floor (stable within a study)", () => {
    const a = buildLayout({ nodes: fixtureNodes() });
    const b = buildLayout({ nodes: fixtureNodes().slice(0, 3) }, a.scale);
    expect(b.scale).toBeGreaterThanOrEqual(a.scale);
  });

  it("ignores duplicate ids and non-finite coordinates", () => {
    const nodes = fixtureNodes();
    const layout = buildLayout({ nodes: [...nodes, { ...nodes[1]!, x: 0 }, { ...nodes[2]!, id: "bad", x: Number.NaN }] });
    expect(layout.nodes.size).toBe(31);
  });

  it("paper stacks grow with step_count, then slow down, capped", () => {
    expect(sheetCount(undefined)).toBe(0);
    expect(sheetCount(0)).toBe(0);
    expect(sheetCount(5)).toBe(5);
    expect(sheetCount(12)).toBe(12);
    expect(sheetCount(16)).toBe(16);
    expect(sheetCount(40)).toBeLessThan(40);
    expect(sheetCount(10_000)).toBe(MAX_SHEETS);
    expect(stackHeight(30)).toBeGreaterThan(stackHeight(10));
  });
});
