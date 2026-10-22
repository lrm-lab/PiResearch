import { describe, expect, it } from "vitest";
import type { Thumbnail } from "../../types/api";
import { frameDistance, MINI_EXTENT, miniLayout } from "./layout";

const SQUARE: [number, number][] = [
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

function thumb(patch: Partial<Thumbnail> = {}): Thumbnail {
  return {
    ok: true,
    message: "",
    edges: [
      { from: "goal", to: "t1", relation: "parent" },
      { from: "goal", to: "t10", relation: "parent" },
      { from: "t1", to: "t2", relation: "error" },
      { from: "t1", to: "ghost", relation: "support" },
    ],
    nodes: [
      { id: "goal", goal: true, x: 1000, y: 1000, radius: 100, tone: "origin", status: "" },
      { id: "t10", goal: false, x: 3000, y: 1000, radius: 60, tone: "green", status: "resolved" },
      { id: "t2", goal: false, x: 1000, y: 2000, radius: 60, tone: "blue", status: "in_progress" },
      { id: "t1", goal: false, x: 140, y: 140, radius: 80, tone: "violet", status: "open" },
    ],
    ...patch,
  };
}

describe("miniLayout", () => {
  it("is empty for missing, failed or node-less thumbnails", () => {
    expect(miniLayout(null).slabs).toEqual([]);
    expect(miniLayout(thumb({ ok: false })).goal).toBeNull();
    expect(miniLayout(thumb({ nodes: [] })).lines).toEqual([]);
  });

  it("centres the bounding box and fits the widest side to the desk extent", () => {
    const layout = miniLayout(thumb());
    const xs = layout.slabs.map((slab) => slab.x).concat(layout.goal!.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(MINI_EXTENT);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0);
  });

  it("orders slabs by task number and colours them by status, errors winning", () => {
    const layout = miniLayout(thumb());
    expect(layout.slabs.map((slab) => slab.id)).toEqual(["t1", "t2", "t10"]);
    expect(layout.slabs.map((slab) => slab.order)).toEqual([0, 1, 2]);
    expect(layout.slabs.map((slab) => slab.tone)).toEqual(["todo", "error", "done"]);
  });

  it("drops edges to unknown nodes and marks rays from the goal", () => {
    const layout = miniLayout(thumb());
    expect(layout.lines).toHaveLength(3);
    expect(layout.lines.filter((line) => line.fromGoal).map((line) => line.tone)).toEqual(["violet", "green"]);
  });

  it("keeps a lone goal a modest prism", () => {
    const layout = miniLayout(thumb({ edges: [], nodes: [{ id: "goal", goal: true, x: 140, y: 140, radius: 72, tone: "origin", status: "" }] }));
    expect(layout.slabs).toEqual([]);
    expect(layout.goal!.size).toBeLessThanOrEqual(0.09 * MINI_EXTENT);
    expect(layout.goal!.x).toBeCloseTo(0);
    // Framed like a desk, not zoomed onto the prism.
    expect(Math.max(...layout.outline.map(([x]) => x))).toBeGreaterThanOrEqual(1.1);
  });

  it("frames wider views closer and never returns a non-finite distance", () => {
    const wide = frameDistance(SQUARE, 2, 30, 0.9);
    const narrow = frameDistance(SQUARE, 1, 30, 0.9);
    expect(wide).toBeLessThan(narrow);
    expect(Number.isFinite(frameDistance([], 0, 30, 0.9))).toBe(true);
  });

  it("keeps the near edge in view despite perspective", () => {
    const fov = 30;
    const polar = 0.9;
    const margin = 0.9;
    const r = frameDistance(SQUARE, 1.6, fov, polar, 0, margin, 0);
    const project = (z: number) => {
      const eye = [0, Math.cos(polar) * r, Math.sin(polar) * r] as const;
      const f = [0, 0.04 - eye[1], -eye[2]];
      const l = Math.hypot(f[1]!, f[2]!);
      const fy = f[1]! / l;
      const fz = f[2]! / l;
      const v = [0, -eye[1], z - eye[2]];
      const depth = v[1]! * fy + v[2]! * fz;
      // Camera up = right × forward = (0, -fz, fy).
      return (v[1]! * -fz + v[2]! * fy) / (depth * Math.tan(((fov / 2) * Math.PI) / 180));
    };
    // The near edge looms larger than the far edge, and both fit.
    expect(Math.abs(project(2))).toBeGreaterThan(Math.abs(project(-2)));
    expect(Math.abs(project(2))).toBeLessThanOrEqual(margin + 1e-3);
    expect(Math.abs(project(2))).toBeGreaterThan(margin * 0.95);
    expect(frameDistance(SQUARE, 1.6, fov, polar, 0, 0.7, 0)).toBeGreaterThan(r);
  });
});
