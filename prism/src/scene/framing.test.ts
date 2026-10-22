import { describe, expect, it } from "vitest";
import { basis, fitOverview, focusDistance, freeArea, worldPerPx, wrapAngle, type FitPoint, type FitView } from "./framing";

function square(half: number): FitPoint[] {
  const pts: FitPoint[] = [];
  for (const x of [-half, half]) for (const z of [-half, half]) pts.push({ x, y: 0, z, padX: 0, padTop: 0, padBottom: 0 });
  return pts;
}

/** Project a world point to CSS px for a camera-controls pose with focal offset. */
function project(p: FitPoint, view: FitView, fit: { distance: number; focalX: number; focalY: number }) {
  const f = basis(view.polar, view.azimuth);
  const cx = p.x * f.rx + p.y * f.ry + p.z * f.rz - fit.focalX;
  // camera-controls moves the camera by -focal.y along up.
  const cy = p.x * f.ux + p.y * f.uy + p.z * f.uz + fit.focalY;
  const along = p.x * f.bx + p.y * f.by + p.z * f.bz;
  const depth = fit.distance - along;
  const tanV = Math.tan((view.fov * Math.PI) / 360);
  const tanH = tanV * (view.width / view.height);
  const nx = cx / (depth * tanH);
  const ny = cy / (depth * tanV);
  return { px: ((nx + 1) / 2) * view.width, py: ((1 - ny) / 2) * view.height };
}

const VIEW: FitView = { polar: 0.62, azimuth: 0, fov: 30, width: 1440, height: 900, right: 0, bottom: 0, fill: 0.86 };

describe("fitOverview", () => {
  it("fits every point inside the fill box, centred", () => {
    const pts = square(10);
    const fit = fitOverview(pts, VIEW);
    expect(fit.distance).toBeGreaterThan(10);
    const px = pts.map((p) => project(p, VIEW, fit));
    const xs = px.map((p) => p.px);
    const ys = px.map((p) => p.py);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1441);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(900 * 0.07 - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(900 * 0.93 + 1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(720, 0);
  });

  it("keeps the content left of a right panel and above a bottom sheet", () => {
    const pts = square(10);
    const right = { ...VIEW, right: 400 };
    const fit = fitOverview(pts, right);
    const xs = pts.map((p) => project(p, right, fit).px);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1040 + 1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(520, 0);
    expect(fit.distance).toBeGreaterThan(fitOverview(pts, VIEW).distance);

    const sheet = { ...VIEW, width: 390, height: 844, bottom: 400 };
    const fitSheet = fitOverview(pts, sheet);
    const ys = pts.map((p) => project(p, sheet, fitSheet).py);
    expect(Math.max(...ys)).toBeLessThanOrEqual(444 + 1);
  });
});

describe("framing helpers", () => {
  it("clamps insets so some view always remains", () => {
    const area = freeArea(1000, 800, 900, -5);
    expect(area.right).toBe(600);
    expect(area.bottom).toBe(0);
    expect(area.freeW).toBe(400);
  });

  it("converts pixels to world units at a distance", () => {
    expect(worldPerPx(10, 30, 900)).toBeCloseTo((2 * 10 * Math.tan(Math.PI / 12)) / 900);
  });

  it("frames a focused card at a readable size", () => {
    const d = focusDistance(1.6, 30, 1440, 900, 400, 0);
    const px = 1.6 / worldPerPx(d, 30, 900);
    expect(px).toBeGreaterThanOrEqual(139);
    expect(px).toBeLessThanOrEqual(521);
  });

  it("wraps angles to (-π, π]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
  });
});
