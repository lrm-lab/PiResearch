// Label chip sizing and placement. Every star gets a DOM chip; this decides where it goes and which
// ones fall back to a compact `T<n>` chip or disappear when the map is crowded. Pure.

import type { Size } from "./transform";

export interface LabelItem {
  id: string;
  /** Orb centre on screen. */
  x: number;
  y: number;
  /** Orb radius on screen (ring included). */
  r: number;
  /** Larger first. */
  priority: number;
  /** Estimated full chip size and compact chip size. */
  full: Size;
  compact: Size;
  /** Always shown in full (hover, selection), placed before anyone else. */
  forced?: boolean;
}

export interface LabelSpot {
  /** Anchor point and which fraction of the chip sits before it (0 left/top, 1 right/bottom). */
  px: number;
  py: number;
  fx: number;
  fy: number;
  compact: boolean;
  /** Resulting rectangle (estimated). */
  rect: Rect;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHIP_MAX_W = 180;
export const GOAL_CHIP_MAX_W = 260;
const PAD_X = 20; // px-2 + border
const LINE = 20;

/** Rough text width at 14px: CJK ~14px, other ~7.6px. */
export function textWidth(text: string, size = 14): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55;
  return w;
}

/**
 * Chip size estimate: id badge + title wrapped to at most 2 lines (goal: 3), plus an optional dark
 * live-call line. The real DOM chip hugs its content, this only has to be close.
 */
export function estimateChip(id: string, title: string, opts: { goal?: boolean; live?: boolean } = {}): Size {
  const max = opts.goal ? GOAL_CHIP_MAX_W : CHIP_MAX_W;
  const idW = opts.goal ? 0 : textWidth(id.toUpperCase(), 11) + 6;
  const textW = textWidth(title || "未命名任务") + idW;
  const inner = max - PAD_X;
  const lines = Math.min(opts.goal ? 3 : 2, Math.max(1, Math.ceil(textW / inner)));
  const w = Math.min(max, Math.ceil(Math.min(textW, inner * lines)) + PAD_X);
  const h = lines * LINE + 10 + (opts.live ? 24 : 0) + (opts.goal ? 18 : 0);
  return { w: Math.max(48, w), h };
}

export function estimateCompact(id: string): Size {
  return { w: Math.ceil(textWidth(id.toUpperCase(), 11)) + 14, h: 22 };
}

const GAP = 5;

/** Candidate anchor spots around an orb, best first: right, left, below, above, then the diagonals. */
export function candidates(item: LabelItem): { px: number; py: number; fx: number; fy: number }[] {
  const d = item.r + GAP;
  const dg = item.r * 0.72 + GAP;
  return [
    { px: item.x + d, py: item.y, fx: 0, fy: 0.5 },
    { px: item.x - d, py: item.y, fx: 1, fy: 0.5 },
    { px: item.x, py: item.y + d, fx: 0.5, fy: 0 },
    { px: item.x, py: item.y - d, fx: 0.5, fy: 1 },
    { px: item.x + dg, py: item.y + dg, fx: 0, fy: 0 },
    { px: item.x - dg, py: item.y + dg, fx: 1, fy: 0 },
    { px: item.x + dg, py: item.y - dg, fx: 0, fy: 1 },
    { px: item.x - dg, py: item.y - dg, fx: 1, fy: 1 },
  ];
}

function rectOf(c: { px: number; py: number; fx: number; fy: number }, size: Size): Rect {
  return { x: c.px - c.fx * size.w, y: c.py - c.fy * size.h, w: size.w, h: size.h };
}

export function overlaps(a: Rect, b: Rect, pad = 3): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function hitsOrb(rect: Rect, orb: { x: number; y: number; r: number }): boolean {
  const nx = Math.max(rect.x, Math.min(orb.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(orb.y, rect.y + rect.h));
  return (nx - orb.x) ** 2 + (ny - orb.y) ** 2 < (orb.r + 1) ** 2;
}

function inside(rect: Rect, view: Size, margin: number): boolean {
  return rect.x >= margin && rect.y >= margin && rect.x + rect.w <= view.w - margin && rect.y + rect.h <= view.h - margin;
}

/**
 * Greedy placement by priority. For each star try the 8 spots with the full chip, then the 8 with the
 * compact chip; an item that fits nowhere gets `null` (hidden). Forced items go first and take the
 * first in-view spot even if it overlaps (they are what the user is looking at). Offscreen orbs get
 * `null`. Deterministic.
 */
export function placeLabels(items: readonly LabelItem[], view: Size, margin = 6): Map<string, LabelSpot | null> {
  const out = new Map<string, LabelSpot | null>();
  const placed: Rect[] = [];
  const orbs = items.map((i) => ({ id: i.id, x: i.x, y: i.y, r: i.r }));
  const ordered = [...items].sort((a, b) => Number(Boolean(b.forced)) - Number(Boolean(a.forced)) || b.priority - a.priority || (a.id < b.id ? -1 : 1));

  for (const item of ordered) {
    const onScreen = item.x > -item.r && item.y > -item.r && item.x < view.w + item.r && item.y < view.h + item.r;
    if (!onScreen) {
      out.set(item.id, null);
      continue;
    }
    const free = (rect: Rect) =>
      inside(rect, view, margin) && !placed.some((p) => overlaps(rect, p)) && !orbs.some((o) => o.id !== item.id && hitsOrb(rect, o));
    const tiers: { size: Size; compact: boolean }[] = [{ size: item.full, compact: false }];
    if (!item.forced) tiers.push({ size: item.compact, compact: true });
    let spot: LabelSpot | null = null;
    for (const tier of tiers) {
      for (const c of candidates(item)) {
        const rect = rectOf(c, tier.size);
        if (free(rect)) {
          spot = { px: c.px, py: c.py, fx: c.fx, fy: c.fy, compact: tier.compact, rect };
          break;
        }
      }
      if (spot) break;
    }
    if (!spot && item.forced) {
      const c = candidates(item).find((cand) => inside(rectOf(cand, item.full), view, margin)) ?? candidates(item)[0]!;
      spot = { px: c.px, py: c.py, fx: c.fx, fy: c.fy, compact: false, rect: rectOf(c, item.full) };
    }
    if (spot) placed.push(spot.rect);
    out.set(item.id, spot);
  }
  return out;
}
