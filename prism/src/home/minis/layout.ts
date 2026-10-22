// Thumbnail → desk layout for the card mini-dioramas. Pure (no three.js), so it is unit tested.
// The server's 2D layout is lifted onto the desk: X = (x - cx)·s, Z = (y - cy)·s, centred on the
// bounding box (so the model sits in the middle of the card), with one scale per thumbnail chosen
// from the span (at least THUMB_MIN_SPAN, so a lone goal stays a modest prism).

import type { NodeStatus, Relation, Thumbnail, Tone } from "../../types/api";
import { taskTone, type TaskTone } from "../../lib/status";
import { THUMB_MIN_SPAN } from "../format";

/** Width of the desk area (world units) the widest side of a thumbnail is fitted to. */
export const MINI_EXTENT = 4;

export interface MiniSlab {
  id: string;
  x: number;
  z: number;
  /** Footprint and thickness (world units). */
  w: number;
  d: number;
  h: number;
  tone: TaskTone;
  status: NodeStatus;
  agentTone: Tone;
  /** Order of appearance (0…n-1, by id number) for the drop-in stagger. */
  order: number;
}

export interface MiniLine {
  from: [number, number];
  to: [number, number];
  relation: Relation;
  /** The line starts at the goal (drawn as a spectrum ray). */
  fromGoal: boolean;
  /** Agent tone of the target node (ray colour). */
  tone: Tone;
}

export interface MiniLayout {
  slabs: MiniSlab[];
  lines: MiniLine[];
  /** Goal position and prism size, or null for a thumbnail without a goal. */
  goal: { x: number; z: number; size: number } | null;
  /** Half extents of everything placed (desk size). */
  halfWidth: number;
  halfDepth: number;
  /** Footprint outline points (slab corners, prism ring) the camera frames. */
  outline: [number, number][];
}

const EMPTY: MiniLayout = { slabs: [], lines: [], goal: null, halfWidth: 1.1, halfDepth: 0.8, outline: [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]] };

/** "t12" → 12, anything else → NaN (sorted last, then by id). */
function idNumber(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : Number.NaN;
}

function byId(a: string, b: string): number {
  const na = idNumber(a);
  const nb = idNumber(b);
  if (Number.isNaN(na) || Number.isNaN(nb) || na === nb) return a < b ? -1 : a > b ? 1 : 0;
  return na - nb;
}

export function miniLayout(thumb: Thumbnail | null | undefined): MiniLayout {
  if (!thumb || !thumb.ok || !thumb.nodes?.length) return EMPTY;
  const nodes = thumb.nodes;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, THUMB_MIN_SPAN);
  const scale = MINI_EXTENT / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const place = (x: number, y: number): [number, number] => [(x - cx) * scale, (y - cy) * scale];

  // A task with an incoming error edge reads as an error (unless it was resolved anyway).
  const erroneous = new Set(thumb.edges.filter((edge) => edge.relation === "error").map((edge) => edge.to));
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  // Slab width follows the 2D radius, but each slab stays inside the space its nearest neighbour
  // leaves (≥ 20% gap), so dense maps get small slabs and sparse ones get generous cards.
  const cap = 0.2 * MINI_EXTENT;
  const floor = 0.03 * MINI_EXTENT;
  const nearest = new Map<string, number>();
  for (const a of nodes) {
    let best = Infinity;
    for (const b of nodes) {
      if (a === b) continue;
      best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y) * scale);
    }
    nearest.set(a.id, best);
  }

  const tasks = nodes.filter((node) => !node.goal).sort((a, b) => byId(a.id, b.id));
  const slabs: MiniSlab[] = tasks.map((node, order) => {
    const [x, z] = place(node.x, node.y);
    const w = Math.min(cap, Math.max(floor, Math.min((node.radius || 48) * scale * 1.9, (nearest.get(node.id) ?? Infinity) * 0.8)));
    return {
      id: node.id,
      x,
      z,
      w,
      d: w * 0.66,
      h: Math.min(0.075, Math.max(0.03, w * 0.15)),
      tone: taskTone(node.status, erroneous.has(node.id)),
      status: node.status,
      agentTone: node.tone,
      order,
    };
  });

  const goalNode = nodes.find((node) => node.goal) ?? null;
  const goal = goalNode
    ? (() => {
        const [x, z] = place(goalNode.x, goalNode.y);
        const size = Math.min(0.09 * MINI_EXTENT, Math.max(0.05 * MINI_EXTENT, (goalNode.radius || 72) * scale * 0.9));
        return { x, z, size };
      })()
    : null;

  const lines: MiniLine[] = [];
  for (const edge of thumb.edges) {
    const from = byNode.get(edge.from);
    const to = byNode.get(edge.to);
    if (!from || !to || from === to) continue;
    lines.push({
      from: place(from.x, from.y),
      to: place(to.x, to.y),
      relation: edge.relation,
      fromGoal: from.goal,
      tone: to.tone,
    });
  }

  // A sparse model still sits in a desk-sized frame, so a lone prism stays small.
  let halfWidth = 1.1;
  let halfDepth = 0.8;
  for (const slab of slabs) {
    halfWidth = Math.max(halfWidth, Math.abs(slab.x) + slab.w / 2);
    halfDepth = Math.max(halfDepth, Math.abs(slab.z) + slab.d / 2);
  }
  if (goal) {
    halfWidth = Math.max(halfWidth, Math.abs(goal.x) + goal.size);
    halfDepth = Math.max(halfDepth, Math.abs(goal.z) + goal.size);
  }
  const outline: [number, number][] = [];
  for (const slab of slabs) {
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) outline.push([slab.x + sx * slab.w, slab.z + sz * slab.d]);
  }
  if (goal) {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      outline.push([goal.x + Math.cos(a) * goal.size * 1.6, goal.z + Math.sin(a) * goal.size * 1.6]);
    }
  }
  // Sparse models keep a desk-sized frame, so a lone prism stays small.
  if (slabs.length < 3) outline.push([-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]);
  return { slabs, lines, goal, halfWidth, halfDepth, outline };
}

/** Where the mini camera looks (a little above the desk). */
export const LOOK_HEIGHT = 0.04;

/**
 * Smallest camera distance at which the footprint `outline` (rotated by `azimuth` about the
 * vertical axis, up to `height` tall) projects inside `margin` of the view, for a perspective camera
 * with vertical `fov` (degrees) on a sphere around the origin at `polar` radians from straight above.
 * Solved numerically, so perspective (the near edge looms larger) is accounted for.
 */
export function frameDistance(
  outline: readonly (readonly [number, number])[],
  aspect: number,
  fov: number,
  polar: number,
  azimuth = 0,
  margin = 0.9,
  height = 0.2,
): number {
  const tanHalf = Math.tan(((fov / 2) * Math.PI) / 180);
  const safeAspect = Math.max(0.4, aspect || 1);
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  const corners: [number, number, number][] = [];
  const points = outline.length ? outline : [[-0.3, -0.3] as const, [0.3, 0.3] as const];
  for (const [x, z] of points) {
    // Rotation about +y by `azimuth` (three.js convention).
    const rx = x * cos + z * sin;
    const rz = -x * sin + z * cos;
    corners.push([rx, 0, rz], [rx, height, rz]);
  }
  const fits = (r: number) => {
    const eye = [0, Math.cos(polar) * r, Math.sin(polar) * r];
    // Forward, right and up vectors of a camera at `eye` looking at (0, LOOK_HEIGHT, 0).
    let fx = -eye[0]!;
    let fy = LOOK_HEIGHT - eye[1]!;
    let fz = -eye[2]!;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = forward × worldUp(0,1,0)
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    // up = right × forward
    const ux = -rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy;
    for (const [px, py, pz] of corners) {
      const vx = px - eye[0]!;
      const vy = py - eye[1]!;
      const vz = pz - eye[2]!;
      const depth = vx * fx + vy * fy + vz * fz;
      if (depth <= 0.05) return false;
      const sx = (vx * rx + vz * rz) / (depth * tanHalf * safeAspect);
      const sy = (vx * ux + vy * uy + vz * uz) / (depth * tanHalf);
      if (Math.abs(sx) > margin || Math.abs(sy) > margin) return false;
    }
    return true;
  };
  let lo = 0.5;
  let hi = 60;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
