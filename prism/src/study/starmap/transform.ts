// Pan / zoom maths for the star map. World = the server's 2D layout (px); screen = CSS px inside
// the map viewport. screen = world * k + (x, y). Pure: tested in starmap.test.ts.

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Transform {
  k: number;
  x: number;
  y: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Never zoom a fitted map past this (a one-node study would otherwise fill the screen). */
export const MAX_FIT_K = 0.6;

export function nodeBounds(nodes: readonly { x: number; y: number; radius: number }[]): Bounds | null {
  if (!nodes.length) return null;
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    b.minX = Math.min(b.minX, n.x - n.radius);
    b.minY = Math.min(b.minY, n.y - n.radius);
    b.maxX = Math.max(b.maxX, n.x + n.radius);
    b.maxY = Math.max(b.maxY, n.y + n.radius);
  }
  return b;
}

export function insetsOf(value: number | Partial<Insets>): Insets {
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  return { top: value.top ?? 0, right: value.right ?? 0, bottom: value.bottom ?? 0, left: value.left ?? 0 };
}

/** The transform that fits `bounds` inside `size` minus `pad`, centred. Deterministic. */
export function fitTransform(bounds: Bounds, size: Size, pad: number | Partial<Insets>): Transform {
  const p = insetsOf(pad);
  const availW = Math.max(1, size.w - p.left - p.right);
  const availH = Math.max(1, size.h - p.top - p.bottom);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const k = Math.min(availW / bw, availH / bh, MAX_FIT_K);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, x: p.left + availW / 2 - cx * k, y: p.top + availH / 2 - cy * k };
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export function zoomLimits(fitK: number): ZoomLimits {
  return { min: fitK * 0.7, max: Math.max(fitK * 14, 1.6) };
}

export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Zoom to scale `k`, keeping the screen point (px, py) fixed. */
export function zoomAt(t: Transform, k: number, px: number, py: number, limits: ZoomLimits): Transform {
  const next = clamp(k, limits.min, limits.max);
  const ratio = next / t.k;
  return { k: next, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
}

/** Keep at least `margin` px of the map on screen so it can never be dragged away. */
export function clampPan(t: Transform, bounds: Bounds, size: Size, margin = 140): Transform {
  const axis = (offset: number, min: number, max: number, extent: number) => {
    const lo = margin - max * t.k;
    const hi = extent - margin - min * t.k;
    return lo > hi ? (lo + hi) / 2 : clamp(offset, lo, hi);
  };
  return { k: t.k, x: axis(t.x, bounds.minX, bounds.maxX, size.w), y: axis(t.y, bounds.minY, bounds.maxY, size.h) };
}

/** Centre world point `p` in the area left free by the panel / sheet, at scale `k` (default: unchanged). */
export function focusTransform(t: Transform, p: Point, size: Size, free: { right?: number; bottom?: number }, k = t.k): Transform {
  const w = size.w - (free.right ?? 0);
  const h = size.h - (free.bottom ?? 0);
  return { k, x: w / 2 - p.x * k, y: h / 2 - p.y * k };
}

export function lerpTransform(a: Transform, b: Transform, f: number): Transform {
  return { k: a.k + (b.k - a.k) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export const toScreen = (t: Transform, p: Point): Point => ({ x: p.x * t.k + t.x, y: p.y * t.k + t.y });

/** Orb radius on screen: grows with the zoom but is never too small to read or hit. */
export function orbRadius(radius: number, k: number, goal: boolean): number {
  const base = Math.max(goal ? 17 : 9, radius * k * 0.9);
  return Math.min(base, goal ? 64 : 46);
}

export function easeOutCubic(f: number): number {
  return 1 - Math.pow(1 - f, 3);
}
