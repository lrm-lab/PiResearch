// Curved edge geometry for the star map (screen space), depth ordering and edge classification.

import { drawnRelation } from "../../lib/edges";
import type { Edge } from "../../types/api";
import type { Point } from "./transform";

export interface EdgeGeometry {
  /** SVG path data, endpoints pulled back to the orbs' rims. */
  d: string;
  /** The curve's midpoint (where the edge label sits). */
  mid: Point;
  /** The point on the curve at the start / end after the pull-back. */
  from: Point;
  to: Point;
  /** The quadratic's control point. */
  ctrl: Point;
}

/** A stable pseudo-random sign / magnitude per edge so curves do not all bend the same way. */
export function bendOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Quadratic curve between two orb centres. `bend` is the control-point offset as a fraction of the
 * length (signed), `gap` pulls both ends back by the orb radius (+ring) so lines do not cross orbs.
 */
export function edgeGeometry(a: Point, b: Point, ra: number, rb: number, bend: number): EdgeGeometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const mx = (a.x + b.x) / 2 + nx * len * bend;
  const my = (a.y + b.y) / 2 + ny * len * bend;
  // Pull the ends back along the chord toward the control point's direction.
  const sa = Math.min(ra, len / 2.5);
  const sb = Math.min(rb, len / 2.5);
  const p0 = { x: a.x + (mx - a.x) / (Math.hypot(mx - a.x, my - a.y) || 1) * sa, y: a.y + (my - a.y) / (Math.hypot(mx - a.x, my - a.y) || 1) * sa };
  const p1 = { x: b.x + (mx - b.x) / (Math.hypot(mx - b.x, my - b.y) || 1) * sb, y: b.y + (my - b.y) / (Math.hypot(mx - b.x, my - b.y) || 1) * sb };
  const mid = { x: 0.25 * p0.x + 0.5 * mx + 0.25 * p1.x, y: 0.25 * p0.y + 0.5 * my + 0.25 * p1.y };
  const f = (n: number) => Math.round(n * 10) / 10;
  return { d: `M${f(p0.x)} ${f(p0.y)}Q${f(mx)} ${f(my)} ${f(p1.x)} ${f(p1.y)}`, mid, from: p0, to: p1, ctrl: { x: mx, y: my } };
}

/** Edge label text from the active node's point of view ("审核", "子任务", "上级任务" …). */
export function edgeLabel(edge: Edge): string {
  switch (drawnRelation(edge.relation)) {
    case "audit":
      return "审核";
    case "support":
      return "支持";
    case "challenge":
      return "挑战";
    case "error":
      return "指出错误";
    default:
      return "子任务";
  }
}

export const isParentEdge = (edge: Edge) => edge.relation === "parent";

/**
 * Depth of every node below the goal along parent edges (goal 0). Nodes the parent tree does not
 * reach get `max + 1`. Used for the intro (stars fade in outward) and the draw-on delays.
 */
export function parentDepths(nodeIds: readonly string[], edges: readonly Edge[], rootId: string | null): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relation !== "parent") continue;
    const list = children.get(edge.from);
    if (list) list.push(edge.to);
    else children.set(edge.from, [edge.to]);
  }
  const depth = new Map<string, number>();
  if (rootId) {
    depth.set(rootId, 0);
    const queue = [rootId];
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i]!;
      for (const child of children.get(id) ?? []) {
        if (depth.has(child)) continue;
        depth.set(child, depth.get(id)! + 1);
        queue.push(child);
      }
    }
  }
  const max = Math.max(0, ...depth.values());
  for (const id of nodeIds) if (!depth.has(id)) depth.set(id, max + 1);
  return depth;
}

/** Edges to draw on demand: those touching `active`, or every verification edge in lens mode. */
export function visibleRelationEdges(edges: readonly Edge[], active: string | null, lens: boolean): Edge[] {
  const out: Edge[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const verification = edge.relation !== "parent";
    const touches = active !== null && (edge.from === active || edge.to === active);
    if (touches || (lens && verification)) out.push(edge);
  }
  return out;
}

/** The point at parameter `t` (0..1) along the curve. */
export function pointAt(geo: EdgeGeometry, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * geo.from.x + 2 * u * t * geo.ctrl.x + t * t * geo.to.x,
    y: u * u * geo.from.y + 2 * u * t * geo.ctrl.y + t * t * geo.to.y,
  };
}

const LABEL_T = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];

/**
 * Spread edge labels: each takes the first spot along its curve (middle first) whose chip does not
 * overlap one already placed; if none is free it keeps the middle. Chip size is `w` x `h`.
 */
export function spreadEdgeLabels(geos: readonly EdgeGeometry[], w = 84, h = 26): Point[] {
  const placed: Point[] = [];
  return geos.map((geo) => {
    let chosen = pointAt(geo, 0.5);
    for (const t of LABEL_T) {
      const p = pointAt(geo, t);
      if (!placed.some((q) => Math.abs(q.x - p.x) < w && Math.abs(q.y - p.y) < h)) {
        chosen = p;
        break;
      }
    }
    placed.push(chosen);
    return chosen;
  });
}
