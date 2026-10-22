// Camera framing. Pure: no three.js.
//
// The overview fit is the camera distance and focal offset (a pan in the camera plane) that fit a
// set of world points, each with a pixel padding, into a fraction of the part of the viewport the
// page chrome leaves free (`right` = detail panel width, `bottom` = mobile bottom sheet). The
// orbit target stays at the origin so the idle drift circles the goal. Adapted from Galaxy's
// framing (same camera-controls conventions).
//
// The scene handles the insets with a lens shift (CameraRig), so it fits the overview into the free
// area as a viewport of its own (right = bottom = 0); the inset fields stay for pan-based callers.
// camera-controls focal offset: +x moves the camera right (content moves left), +y moves the
// camera DOWN (content moves up).

export interface FitPoint {
  x: number;
  y: number;
  z: number;
  /** Extra pixels the point needs on each side horizontally / above / below. */
  padX: number;
  padTop: number;
  padBottom: number;
}

export interface FitView {
  /** From +Y, radians. */
  polar: number;
  azimuth: number;
  /** Vertical field of view, degrees. */
  fov: number;
  width: number;
  height: number;
  /** Pixels covered on the right (detail panel) and bottom (sheet). */
  right: number;
  bottom: number;
  /** Fraction of the free area (each axis) the bounds should fill. */
  fill: number;
}

export interface Fit {
  distance: number;
  /** camera-controls focal offset (world units, camera plane). */
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
export function basis(polar: number, azimuth: number): Frame {
  const sp = Math.sin(polar);
  const bx = sp * Math.sin(azimuth);
  const by = Math.cos(polar);
  const bz = sp * Math.cos(azimuth);
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
  cx: number;
  cy: number;
  along: number;
  point: FitPoint;
}

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
    min = Math.max(min, c - hi(p.point) * span);
    max = Math.min(max, c - lo(p.point) * span);
  }
  return min <= max ? [min, max] : null;
}

/** Free area after the insets, never less than 40% of the viewport on either axis. */
export function freeArea(width: number, height: number, right: number, bottom: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = Math.min(Math.max(0, right || 0), w * 0.6);
  const b = Math.min(Math.max(0, bottom || 0), h * 0.6);
  return { width: w, height: h, right: r, bottom: b, freeW: w - r, freeH: h - b };
}

export function fitOverview(points: FitPoint[], view: FitView): Fit {
  const area = freeArea(view.width, view.height, view.right, view.bottom);
  const { width, height } = area;
  const tanV = Math.tan((view.fov * Math.PI) / 360);
  const tanH = tanV * (width / height);
  const f = basis(view.polar, view.azimuth);
  const projected: Projected[] = points.map((point) => ({
    cx: point.x * f.rx + point.y * f.ry + point.z * f.rz,
    cy: point.x * f.ux + point.y * f.uy + point.z * f.uz,
    along: point.x * f.bx + point.y * f.by + point.z * f.bz,
    point,
  }));

  const marginX = ((1 - view.fill) / 2) * area.freeW;
  const marginY = ((1 - view.fill) / 2) * area.freeH;
  const toNdcX = (px: number) => (px / width) * 2 - 1;
  const toNdcY = (py: number) => 1 - (py / height) * 2;
  const left = (p: FitPoint) => toNdcX(marginX + p.padX);
  const right = (p: FitPoint) => toNdcX(area.freeW - marginX - p.padX);
  const upper = (p: FitPoint) => toNdcY(marginY + p.padTop);
  const lower = (p: FitPoint) => toNdcY(area.freeH - marginY - p.padBottom);

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
  // Solved in "content up" convention; camera-controls moves the camera by -focal.y.
  return { distance: far, focalX: (fit.x[0] + fit.x[1]) / 2, focalY: -(fit.y[0] + fit.y[1]) / 2 };
}

/** World units per CSS px at `distance` (perspective, vertical fov in degrees). */
export function worldPerPx(distance: number, fov: number, height: number): number {
  return (2 * distance * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height);
}

/**
 * Camera distance that shows a card `cardWidth` wide at about a fifth of the free width
 * (140–520 px), so its face is readable and a few neighbours stay in view.
 */
export function focusDistance(cardWidth: number, fov: number, width: number, height: number, right: number, bottom: number): number {
  const area = freeArea(width, height, right, bottom);
  const target = Math.min(520, Math.max(140, Math.min(area.freeW * 0.2, area.freeH * 0.4)));
  const tan = Math.tan((fov * Math.PI) / 360);
  return (cardWidth * area.height) / (2 * tan * target);
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
