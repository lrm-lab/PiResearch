// The server's 2D layout lifted onto the desk (DESIGN.md §3 "Layout"). Pure: no three.js.
//
//   X = (x - goal.x) * s,  Z = (y - goal.y) * s
//
// One scale `s` per snapshot, chosen so that no two footprints overlap: cards are axis-aligned
// rectangles on the desk (the camera turns, the cards never do), so a pair is apart when it is
// apart on either axis. For every pair the scale that separates it with a 15% gap is the smaller
// of the per-axis scales; the layout scale is the largest of those over all pairs (the binding
// pair is not always the closest one, because card sizes differ). Positions depend only on the
// snapshot geometry, never on status.

import type { Snapshot, ViewNode } from "../types/api";

/** Logical size of a card face in CSS px (the canvas is drawn at 2x). */
export const FACE_W = 288;
export const FACE_H = 176;
export const CARD_ASPECT = FACE_W / FACE_H;
/** World width of a card of median radius. */
export const CARD_BASE_W = 1.6;
/** Card slab thickness (world). */
export const CARD_THICKNESS = 0.05;
/** Gap factor between neighbouring footprints (≥ 15%). */
export const GAP = 1.15;
/** Side of the square footprint reserved for the goal prism. */
export const PRISM_FOOT = 2.3;
/** Scale clamp (world units per layout px). */
export const S_MIN = 0.002;
export const S_MAX = 0.03;
/** Scale used when there is nothing to separate (0 or 1 node). */
export const S_DEFAULT = 0.012;

/** Radius range the card size follows (the API's radius grows with tool calls). */
const R_LO = 44;
const R_HI = 120;

export interface Footprint {
  w: number;
  d: number;
}

export interface LayoutNode {
  id: string;
  goal: boolean;
  /** World position of the centre on the desk. */
  x: number;
  z: number;
  /** Footprint (world). */
  w: number;
  d: number;
  /** Uniform scale of the card relative to the base card (1 = CARD_BASE_W wide). */
  k: number;
}

export interface Layout {
  scale: number;
  nodes: Map<string, LayoutNode>;
  /** Bounds of every footprint on the desk. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Largest distance from the origin to a footprint corner (at least the prism). */
  radius: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Uniform card scale for a node radius: 0.9 … 1.1 of the base card. */
export function cardScale(radius: number): number {
  const t = clamp(((Number.isFinite(radius) ? radius : R_LO) - R_LO) / (R_HI - R_LO), 0, 1);
  return 0.9 + 0.2 * t;
}

export function footprint(node: Pick<ViewNode, "goal" | "radius">): Footprint {
  if (node.goal) return { w: PRISM_FOOT, d: PRISM_FOOT };
  const w = CARD_BASE_W * cardScale(node.radius);
  return { w, d: w / CARD_ASPECT };
}

interface Placed {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** Smallest scale that keeps two footprints apart (with GAP) on at least one axis. */
export function pairScale(a: Placed, b: Placed): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const sx = dx > 1e-9 ? (GAP * (a.w + b.w)) / 2 / dx : Infinity;
  const sy = dy > 1e-9 ? (GAP * (a.d + b.d)) / 2 / dy : Infinity;
  return Math.min(sx, sy);
}

/** The layout scale for a set of nodes: the largest pair scale, clamped. */
export function layoutScale(nodes: readonly Pick<ViewNode, "x" | "y" | "radius" | "goal">[]): number {
  const placed: Placed[] = nodes.map((node) => ({ x: node.x, y: node.y, ...footprint(node) }));
  let need = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      // Coincident centres can never be separated by scaling; they must not blow up the layout.
      const s = pairScale(placed[i]!, placed[j]!);
      if (Number.isFinite(s)) need = Math.max(need, s);
    }
  }
  if (need === 0) return S_DEFAULT;
  return clamp(need, S_MIN, S_MAX);
}

/** Initial placement scale relative to the separating scale: below 1 the layout starts overlapped and is relaxed. */
export const COMPACT = 0.5;
/** Relaxation: passes, and the per-pass pull toward the goal (fades to 0). Skipped above MAX_RELAX nodes. */
const RELAX_PASSES = 260;
const RELAX_PULL = 0.02;
/** The desk is seen on a landscape screen, so start squashed in depth and pull sideways less. */
const DEPTH_SQUASH = 0.7;
const SIDE_PULL = 0.5;
const MAX_RELAX = 250;
const MAX_SEPARATE = 3000;
/** The question card's footprint on the desk (world), reserved behind the prism. */
const KEEPOUT_W = 3.6;
const KEEPOUT_D = 3.2;

interface Body {
  x: number;
  z: number;
  w: number;
  d: number;
  fixed: boolean;
}

/** One pass of axis-aligned separation (smallest penetration axis); returns whether anything moved. */
function separate(bodies: Body[]): boolean {
  let moved = false;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const ox = (GAP * (a.w + b.w)) / 2 - Math.abs(dx);
      const oz = (GAP * (a.d + b.d)) / 2 - Math.abs(dz);
      if (ox <= 1e-9 || oz <= 1e-9) continue;
      moved = true;
      const alongX = ox < oz;
      const gap = (alongX ? ox : oz) + 1e-7;
      const delta = alongX ? dx : dz;
      const sign = delta > 0 ? 1 : delta < 0 ? -1 : j % 2 ? 1 : -1;
      const share = a.fixed ? [0, 1] : b.fixed ? [1, 0] : [0.5, 0.5];
      if (alongX) {
        a.x -= sign * gap * share[0]!;
        b.x += sign * gap * share[1]!;
      } else {
        a.z -= sign * gap * share[0]!;
        b.z += sign * gap * share[1]!;
      }
    }
  }
  return moved;
}

/**
 * Compact the layout: start from the server positions at COMPACT x the separating scale, then
 * alternate "separate overlapping footprints" with a fading pull toward the goal, and finish with
 * pure separation. Deterministic (bodies are processed in id order) and independent of status.
 * Returns false if it fails to separate (the caller falls back to the plain scaled layout).
 */
function relax(bodies: Body[]): boolean {
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    separate(bodies);
    const pull = RELAX_PULL * (1 - pass / RELAX_PASSES);
    for (const body of bodies) {
      if (body.fixed) continue;
      body.x *= 1 - pull * SIDE_PULL;
      body.z *= 1 - pull;
    }
  }
  // Pure separation; if a jam makes it cycle, nudge everything outward a little and go on.
  let rounds = 0;
  while (separate(bodies)) {
    rounds += 1;
    if (rounds > MAX_SEPARATE) return false;
    if (rounds % 60 === 0) {
      for (const body of bodies) {
        if (body.fixed) continue;
        body.x *= 1.02;
        body.z *= 1.02;
      }
    }
  }
  return true;
}

/**
 * Lift a snapshot onto the desk. `floor` keeps the scale from shrinking within one study (a node
 * that left must not pull everything together); pass the previous layout's scale.
 */
export function buildLayout(view: Pick<Snapshot, "nodes"> | null, floor = 0): Layout {
  const nodes = new Map<string, LayoutNode>();
  const list = (view?.nodes ?? []).filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  // First occurrence wins, like the store's index.
  const seen = new Set<string>();
  const unique: ViewNode[] = [];
  for (const node of list) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    unique.push(node);
  }
  const goal = unique.find((node) => node.goal);
  let ox = 0;
  let oy = 0;
  if (goal) {
    ox = goal.x;
    oy = goal.y;
  } else if (unique.length) {
    for (const node of unique) {
      ox += node.x;
      oy += node.y;
    }
    ox /= unique.length;
    oy /= unique.length;
  }
  const scale = Math.max(layoutScale(unique), Math.min(floor, S_MAX));

  // Compacted positions (id order for determinism), falling back to the plain scaled layout.
  const ordered = [...unique].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bodies: Body[] = ordered.map((node) => {
    const { w, d } = footprint(node);
    // The goal reserves a keep-out behind the prism for the question card, so it never covers a task.
    if (node.goal) return { x: 0, z: -KEEPOUT_D / 2, w: Math.max(w, KEEPOUT_W), d: d + KEEPOUT_D, fixed: true };
    return { x: (node.x - ox) * scale * COMPACT, z: (node.y - oy) * scale * COMPACT * DEPTH_SQUASH, w, d, fixed: false };
  });
  let compact = ordered.length > 1 && ordered.length <= MAX_RELAX && relax(bodies);
  if (compact) compact = bodies.every((body) => Number.isFinite(body.x) && Number.isFinite(body.z));
  const place = new Map<string, { x: number; z: number }>();
  ordered.forEach((node, i) => {
    if (compact) place.set(node.id, node.goal ? { x: 0, z: 0 } : { x: bodies[i]!.x, z: bodies[i]!.z });
    else place.set(node.id, { x: (node.x - ox) * scale, z: (node.y - oy) * scale });
  });

  let minX = -PRISM_FOOT / 2;
  let maxX = PRISM_FOOT / 2;
  let minZ = -PRISM_FOOT / 2;
  let maxZ = PRISM_FOOT / 2;
  let radius = Math.SQRT2 * (PRISM_FOOT / 2);
  for (const node of unique) {
    const { w, d } = footprint(node);
    const { x, z } = place.get(node.id)!;
    nodes.set(node.id, { id: node.id, goal: node.goal, x, z, w, d, k: node.goal ? 1 : w / CARD_BASE_W });
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2);
    maxZ = Math.max(maxZ, z + d / 2);
    radius = Math.max(radius, Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2));
  }
  return { scale, nodes, minX, maxX, minZ, maxZ, radius };
}

/** Whether two placed footprints overlap (used by tests and the dev harness). */
export function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
}

// ---------------------------------------------------------------------------
// Paper stacks

/** Sheet thickness and pitch (world). */
export const SHEET_PITCH = 0.016;
export const MAX_SHEETS = 24;

/** Sheets under a card: one per step up to 12, then slower (√) growth, capped. */
export function sheetCount(stepCount: number | undefined): number {
  const steps = Math.max(0, Math.floor(stepCount ?? 0));
  if (steps <= 12) return steps;
  return Math.min(MAX_SHEETS, 12 + Math.round(Math.sqrt(steps - 12) * 2));
}

/** Height of a paper stack (where the card rests). */
export function stackHeight(stepCount: number | undefined): number {
  return sheetCount(stepCount) * SHEET_PITCH;
}
