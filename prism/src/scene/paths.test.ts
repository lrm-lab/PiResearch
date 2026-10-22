import { describe, expect, it } from "vitest";
import { deskPath, inside, laneOffsets, pointAt, relationStyle, resample, ribbon, roundedRectOutline } from "./paths";

const A = { x: 0, z: 0, w: 1.6, d: 1 };
const B = { x: 6, z: 0, w: 1.6, d: 1 };

describe("deskPath", () => {
  it("trims the curve where it leaves each footprint", () => {
    const path = deskPath(A, B, { bend: 0, lane: 0, arch: 0, zigzag: 0 });
    const first = path.points[0]!;
    const last = path.points[path.points.length - 1]!;
    expect(inside(first.x, first.z, A, 0)).toBe(false);
    expect(inside(last.x, last.z, B, 0)).toBe(false);
    expect(first.x).toBeGreaterThan(0.8);
    expect(last.x).toBeLessThan(5.2);
    expect(path.length).toBeGreaterThan(4);
    expect(path.length).toBeLessThan(4.6);
  });

  it("trims against a round footprint (the prism)", () => {
    const path = deskPath({ x: 0, z: 0, w: 1.5, d: 1.5, round: 0.6 }, B, { bend: 0, lane: 0, arch: 0, zigzag: 0 });
    expect(path.points[0]!.x).toBeGreaterThan(0.6);
    expect(path.points[0]!.x).toBeLessThan(0.75);
  });

  it("lifts a challenge into an arch and keeps other relations flat", () => {
    const style = relationStyle("challenge", 6);
    expect(style.arch).toBeGreaterThan(0);
    const path = deskPath(A, B, { ...style, lane: 0 });
    expect(pointAt(path, 0.5).y).toBeCloseTo(style.arch, 2);
    expect(path.points[0]!.y).toBeCloseTo(0, 5);
    const flat = deskPath(A, B, { ...relationStyle("support", 6), lane: 0 });
    expect(Math.max(...flat.points.map((p) => p.y))).toBe(0);
  });

  it("makes an error jagged but keeps the ends in place", () => {
    const smooth = deskPath(A, B, { bend: 0, lane: 0, arch: 0, zigzag: 0 });
    const jagged = deskPath(A, B, { bend: 0, lane: 0, arch: 0, zigzag: 0.05 });
    const maxDev = Math.max(...jagged.points.map((p) => Math.abs(p.z)));
    expect(maxDev).toBeGreaterThan(0.02);
    expect(maxDev).toBeLessThanOrEqual(0.0501);
    // Long jagged paths are sampled densely enough to keep their teeth.
    expect(jagged.points.length).toBeGreaterThan(smooth.points.length);
    expect(jagged.points[0]!.z).toBeCloseTo(smooth.points[0]!.z, 5);
  });

  it("bends to one side and survives coincident footprints", () => {
    const bent = deskPath(A, B, { bend: 0.1, lane: 0, arch: 0, zigzag: 0 });
    expect(pointAt(bent, 0.5).z).toBeGreaterThan(0.25);
    const same = deskPath(A, A, { bend: 0.1, lane: 0, arch: 0, zigzag: 0 });
    expect(same.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
  });
});

describe("laneOffsets", () => {
  it("spreads parallel relations of one pair, whatever their direction", () => {
    const offsets = laneOffsets([
      { from: "t5", to: "t1", relation: "audit" },
      { from: "t5", to: "t1", relation: "support" },
      { from: "goal", to: "t1", relation: "parent" },
      { from: "t1", to: "t5", relation: "challenge" },
    ]);
    expect(offsets[2]).toBe(0);
    expect(new Set([offsets[0], offsets[1]]).size).toBe(2);
    expect(offsets[0]! + offsets[1]! - offsets[3]!).toBeCloseTo(0);
  });
});

describe("ribbon", () => {
  it("emits two vertices per sample with u along and v across", () => {
    const path = deskPath(A, B, { bend: 0, lane: 0, arch: 0, zigzag: 0 }, 10);
    const data = ribbon(path);
    expect(data.position.length).toBe(10 * 2 * 3);
    expect(data.index.length).toBe(9 * 6);
    expect(data.uv[0]).toBe(0);
    expect(data.uv[1]).toBe(-1);
    expect(data.uv[3]).toBe(1);
    expect(data.uv[data.uv.length - 2]).toBeCloseTo(1);
    // Side vector is perpendicular to a path along +x.
    expect(Math.abs(data.side[0]!)).toBeCloseTo(0);
    expect(Math.abs(data.side[2]!)).toBeCloseTo(1);
  });
});

describe("helpers", () => {
  it("resamples evenly", () => {
    const out = resample([[0, 0], [1, 0], [3, 0]], 4);
    expect(out.length).toBe(3);
    expect(out.points.map((p) => p[0])).toEqual([0, 1, 2, 3]);
  });

  it("outlines a rounded rectangle with outward normals", () => {
    const pts = roundedRectOutline(2, 1, 0.2, 4);
    expect(pts).toHaveLength(20);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1);
    }
  });
});
