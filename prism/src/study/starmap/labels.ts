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

export const CHIP_MAX_W = 176;
const PAD_X = 12; // px-1.5 on each side

/** Rough text width: CJK ~1em, other ~0.55em. */
export function textWidth(text: string, size = 14): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55;
  return w;
}

/**
 * Label size estimate: a one-line title (14px, capped at ~160px) over a one-line meta line (12px),
 * plus an optional mono live-call line. The real DOM label hugs its content, this only has to be close.
 */
export function estimateChip(title: string, meta: string, opts: { live?: string } = {}): Size {
  const titleW = Math.min(160, textWidth(title || "未命名任务"));
  const metaW = textWidth(meta, 12);
  const liveW = opts.live ? textWidth(opts.live, 12) * 0.9 : 0;
  const w = Math.min(CHIP_MAX_W, Math.ceil(Math.max(titleW, metaW, liveW)) + PAD_X);
  return { w: Math.max(48, w), h: 20 + 16 + 4 + (opts.live ? 18 : 0) };
}

export function estimateCompact(id: string): Size {
  return { w: Math.ceil(textWidth(id.toUpperCase(), 12)) + 10, h: 22 };
}

/**
 * The goal card comes in three sizes so it never sits on top of the tasks around it: tier 0 is the full
 * card (eyebrow, two-line question, progress), tier 1 a one-line question, tier 2 a mini card (mark,
 * one-line question, progress), tier 3 a pill (mark and eyebrow; the full card returns on hover).
 */
export type GoalTier = 0 | 1 | 2 | 3;

export function estimateGoalCard(title: string, tier: GoalTier = 0): Size {
  if (tier === 3) return { w: 108, h: 32 };
  if (tier === 2) return { w: 188, h: 50 };
  const w = tier === 1 ? 232 : 272;
  const lines = tier === 1 ? 1 : Math.min(2, Math.max(1, Math.ceil(textWidth(title, 14) / (w - 32))));
  return { w, h: 60 + lines * 20 };
}

/** The roomiest tier whose box (plus `pad`) stays clear of every tile; the smallest if none does. */
export function chooseGoalTier(title: string, at: { x: number; y: number }, tiles: readonly { x: number; y: number; r: number }[], first: GoalTier = 0, pad = 6): GoalTier {
  for (const tier of [0, 1, 2, 3] as const) {
    if (tier < first) continue;
    const { w, h } = estimateGoalCard(title, tier);
    const clear = tiles.every((t) => {
      const nx = Math.max(at.x - w / 2, Math.min(t.x, at.x + w / 2));
      const ny = Math.max(at.y - h / 2, Math.min(t.y, at.y + h / 2));
      return Math.abs(t.x - nx) > t.r + pad || Math.abs(t.y - ny) > t.r + pad;
    });
    if (clear) return tier;
  }
  return 3;
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
 * `null`. `obstacles` are rectangles no label may cover (the goal card). Deterministic.
 */
export function placeLabels(items: readonly LabelItem[], view: Size, margin = 6, obstacles: readonly Rect[] = []): Map<string, LabelSpot | null> {
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
      inside(rect, view, margin) && !placed.some((p) => overlaps(rect, p)) && !obstacles.some((o) => overlaps(rect, o, 2)) && !orbs.some((o) => o.id !== item.id && hitsOrb(rect, o));
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
