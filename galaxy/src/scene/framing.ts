// Overview framing: the camera distance and focal offset (pan in the camera
// plane) that fit a set of world points, each with a pixel padding, into a
// fraction of the free viewport. Pure: the orbit target stays at the origin so
// auto-rotate and the core flights keep circling the goal.

export interface FitPoint {
  x: number;
  y: number;
  z: number;
  /** Extra pixels the point needs on each side (labels, body radius). */
  padX: number;
  padTop: number;
  padBottom: number;
}

export interface FitView {
  polar: number;
  azimuth: number;
  /** Vertical field of view, degrees. */
  fov: number;
  width: number;
  height: number;
  /** Pixels covered at the top by the HUD bar. */
  top: number;
  /** Fraction of the free area (each axis) the bounds should fill. */
  fill: number;
}

export interface Fit {
  distance: number;
  /** Camera-plane offset (camera-controls focal offset). */
  focalX: number;
  focalY: number;
}

interface Frame {
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  bx: number;
  by: number;
  bz: number;
}

/** Camera basis for a camera-controls spherical pose (Y up). */
function basis(polar: number, azimuth: number): Frame {
  const sp = Math.sin(polar);
  // Backward (target → camera).
  const bx = sp * Math.sin(azimuth);
  const by = Math.cos(polar);
  const bz = sp * Math.cos(azimuth);
  // right = normalize(up × back), up' = back × right.
  let rx = bz;
  const ry = 0;
  let rz = -bx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = by * rz - bz * ry;
  const uy = bz * rx - bx * rz;
  const uz = bx * ry - by * rx;
  return { rx, ry, rz, ux, uy, uz, bx, by, bz };
}

interface Projected {
  /** Camera-plane coordinates relative to the target. */
  cx: number;
  cy: number;
  /** Depth along the view direction at distance 0. */
  along: number;
  point: FitPoint;
}

/**
 * For a distance, the focal range on one axis that keeps every point inside
 * [lo, hi] (NDC, after its padding), or null when none does.
 */
function axisRange(
  points: Projected[],
  distance: number,
  half: number,
  pick: (p: Projected) => number,
  lo: (p: FitPoint) => number,
  hi: (p: FitPoint) => number,
): [number, number] | null {
  let min = -Infinity;
  let max = Infinity;
  for (const p of points) {
    const depth = distance - p.along;
    if (depth <= 0.05) return null;
    const span = depth * half;
    const c = pick(p);
    // ndc = (c - focal) / span ∈ [lo, hi]  ⇔  focal ∈ [c - hi·span, c - lo·span]
    min = Math.max(min, c - hi(p.point) * span);
    max = Math.min(max, c - lo(p.point) * span);
  }
  return min <= max ? [min, max] : null;
}

export function fitOverview(points: FitPoint[], view: FitView): Fit {
  const width = Math.max(1, view.width);
  const height = Math.max(1, view.height);
  const top = Math.min(Math.max(0, view.top), height * 0.5);
  const tanV = Math.tan((view.fov * Math.PI) / 360);
  const tanH = tanV * (width / height);
  const f = basis(view.polar, view.azimuth);
  const projected: Projected[] = points.map((point) => ({
    cx: point.x * f.rx + point.y * f.ry + point.z * f.rz,
    cy: point.x * f.ux + point.y * f.uy + point.z * f.uz,
    along: point.x * f.bx + point.y * f.by + point.z * f.bz,
    point,
  }));

  // Target rectangle in NDC: `fill` of the free area (below the top bar), centred in it.
  const freeH = height - top;
  const marginX = ((1 - view.fill) / 2) * width;
  const marginY = ((1 - view.fill) / 2) * freeH;
  const toNdcX = (px: number) => (px / width) * 2 - 1;
  const toNdcY = (py: number) => 1 - (py / height) * 2;
  const left = (p: FitPoint) => toNdcX(marginX + p.padX);
  const right = (p: FitPoint) => toNdcX(width - marginX - p.padX);
  const upper = (p: FitPoint) => toNdcY(top + marginY + p.padTop);
  const lower = (p: FitPoint) => toNdcY(height - marginY - p.padBottom);

  const solve = (distance: number) => {
    const x = axisRange(projected, distance, tanH, (p) => p.cx, left, right);
    const y = x && axisRange(projected, distance, tanV, (p) => p.cy, lower, upper);
    return x && y ? { x, y } : null;
  };

  let near = Math.max(0.5, ...projected.map((p) => p.along + 0.1));
  let far = Math.max(near * 2, 8);
  let tries = 0;
  while (!solve(far) && tries++ < 40) far *= 1.6;
  for (let i = 0; i < 48; i++) {
    const mid = (near + far) / 2;
    if (solve(mid)) far = mid;
    else near = mid;
  }
  const fit = solve(far);
  if (!fit) return { distance: far, focalX: 0, focalY: 0 };
  return { distance: far, focalX: (fit.x[0] + fit.x[1]) / 2, focalY: (fit.y[0] + fit.y[1]) / 2 };
}
