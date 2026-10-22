// Relation and ray paths on the desk, and the ribbon vertex data built from them. Pure: plain
// arrays, no three.js (the components wrap them in BufferGeometry).

import type { Edge, Relation } from "../types/api";

export interface Footprint2D {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Goal prism: trim against a circle of this radius instead of the rectangle. */
  round?: number;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

export interface DeskPath {
  points: PathPoint[];
  /** World length along the desk. */
  length: number;
}

export interface PathStyle {
  /** Sideways bulge of the curve as a share of the length. */
  bend: number;
  /** Extra sideways offset at the middle (parallel relations between one pair). */
  lane: number;
  /** Height of an arch lifted off the desk (challenge), 0 = flat. */
  arch: number;
  /** Jagged amplitude (error), 0 = smooth. */
  zigzag: number;
}

/** Look of each relation's path (fusion is drawn as audit). */
export function relationStyle(relation: Relation, length: number): Omit<PathStyle, "lane"> {
  switch (relation) {
    case "parent":
      return { bend: 0.1, arch: 0, zigzag: 0 };
    case "challenge":
      return { bend: 0.03, arch: Math.min(1.1, Math.max(0.3, length * 0.2)), zigzag: 0 };
    case "error":
      return { bend: 0.05, arch: 0, zigzag: 0.06 };
    default:
      return { bend: 0.05, arch: 0, zigzag: 0 };
  }
}

const PAD = 0.05;
/** Tooth length of a jagged (error) relation, world units. */
export const ZIG_PERIOD = 0.26;

export function inside(x: number, z: number, f: Footprint2D, pad = PAD): boolean {
  if (f.round) return Math.hypot(x - f.x, z - f.z) < f.round + pad;
  return Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad;
}

/** Sideways offsets so relations between the same pair run side by side. */
export function laneOffsets(edges: readonly Edge[], spacing = 0.16): number[] {
  const groups = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = edge.from < edge.to ? `${edge.from}|${edge.to}` : `${edge.to}|${edge.from}`;
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });
  const offsets = edges.map(() => 0);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.forEach((index, i) => {
      const edge = edges[index]!;
      // Offsets are measured on the canonical (sorted) direction; a reversed edge flips its side.
      const sign = edge.from < edge.to ? 1 : -1;
      offsets[index] = (i - (list.length - 1) / 2) * spacing * sign;
    });
  }
  return offsets;
}

function bezier(ax: number, az: number, cx: number, cz: number, bx: number, bz: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * az + 2 * u * t * cz + t * t * bz];
}

/** Resample a 2D polyline into `count` points evenly spaced by arc length. */
export function resample(points: [number, number][], count: number): { points: [number, number][]; length: number } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1]!;
    const [x1, z1] = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(x1 - x0, z1 - z0));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  if (points.length < 2 || total <= 1e-9) return { points: points.slice(0, 1), length: 0 };
  const out: [number, number][] = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const s = (i / (count - 1)) * total;
    while (j < lengths.length - 1 && lengths[j]! < s) j++;
    const s0 = lengths[j - 1]!;
    const s1 = lengths[j]!;
    const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const [x0, z0] = points[j - 1]!;
    const [x1, z1] = points[j]!;
    out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return { points: out, length: total };
}

/**
 * A relation's path: a quadratic curve between the two footprints, trimmed where it leaves each
 * footprint, resampled evenly, then lifted into an arch or made jagged.
 */
export function deskPath(from: Footprint2D, to: Footprint2D, style: PathStyle, count = 56): DeskPath {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  const nx = -dz / len;
  const nz = dx / len;
  // The bend bulges the middle; the lane shifts the whole relation sideways so parallel relations
  // between one pair stay apart all the way into the cards.
  const off = style.bend * len;
  const lx = nx * style.lane;
  const lz = nz * style.lane;
  const cx = (from.x + to.x) / 2 + nx * off + lx;
  const cz = (from.z + to.z) / 2 + nz * off + lz;
  const raw: [number, number][] = [];
  const N = 96;
  for (let i = 0; i <= N; i++) raw.push(bezier(from.x + lx, from.z + lz, cx, cz, to.x + lx, to.z + lz, i / N));
  let i0 = 0;
  while (i0 < N && inside(raw[i0]![0], raw[i0]![1], from)) i0++;
  let i1 = N;
  while (i1 > 0 && inside(raw[i1]![0], raw[i1]![1], to)) i1--;
  const trimmed = i0 < i1 ? raw.slice(i0, i1 + 1) : [raw[0]!, raw[N]!];
  // A jagged path needs a few samples per tooth, whatever its length.
  const samples = style.zigzag > 0 ? Math.min(900, Math.max(count, Math.ceil((len / ZIG_PERIOD) * 6))) : count;
  const even = resample(trimmed, samples);
  const pts = even.points;
  const points: PathPoint[] = pts.map(([x, z], i) => {
    const u = pts.length > 1 ? i / (pts.length - 1) : 0;
    let px = x;
    let pz = z;
    if (style.zigzag > 0 && pts.length > 2) {
      // Triangle wave across the local tangent, tapered at both ends.
      const prev = pts[Math.max(0, i - 1)]!;
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const tx = next[0] - prev[0];
      const tz = next[1] - prev[1];
      const tl = Math.hypot(tx, tz) || 1;
      const s = u * even.length;
      const phase = (s / ZIG_PERIOD) % 1;
      const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
      const taper = Math.min(1, u * 8, (1 - u) * 8);
      px += (-tz / tl) * tri * style.zigzag * taper;
      pz += (tx / tl) * tri * style.zigzag * taper;
    }
    return { x: px, y: style.arch > 0 ? Math.sin(Math.PI * u) * style.arch : 0, z: pz };
  });
  return { points, length: even.length };
}

/** Point on a path at 0…1 (linear between samples). */
export function pointAt(path: DeskPath, t: number): PathPoint {
  const pts = path.points;
  if (!pts.length) return { x: 0, y: 0, z: 0 };
  const f = Math.min(1, Math.max(0, t)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  if (i < 0) return pts[0]!;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const k = f - i;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

export interface RibbonData {
  /** Centre line positions, two identical vertices per sample. */
  position: Float32Array;
  /** Sideways unit vector per vertex (xz, y = 0). */
  side: Float32Array;
  /** u = arc length share 0…1, v = −1 (left) / +1 (right). */
  uv: Float32Array;
  index: Uint32Array;
}

/** Vertex data for a flat ribbon along a path; the vertex shader widens it along `side`. */
export function ribbon(path: DeskPath): RibbonData {
  const pts = path.points;
  const n = pts.length;
  const position = new Float32Array(n * 2 * 3);
  const side = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const index = new Uint32Array(Math.max(0, n - 1) * 6);
  const cumulative = [0];
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cumulative[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    for (let k = 0; k < 2; k++) {
      const v = i * 2 + k;
      position.set([p.x, p.y, p.z], v * 3);
      side.set([-tz, 0, tx], v * 3);
      uv.set([cumulative[i]! / total, k === 0 ? -1 : 1], v * 2);
    }
    if (i < n - 1) {
      const a = i * 2;
      index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
  }
  return { position, side, uv, index };
}

/** Rounded rectangle outline (centred, in the xz plane) sampled for the card edge strip. */
export function roundedRectOutline(w: number, d: number, r: number, cornerSegments = 8): { x: number; z: number; nx: number; nz: number }[] {
  const rr = Math.min(r, w / 2, d / 2);
  const hx = w / 2 - rr;
  const hz = d / 2 - rr;
  // Corners counter-clockwise starting at +x +z, each followed by its straight edge.
  const corners: [number, number, number][] = [
    [hx, hz, 0],
    [-hx, hz, Math.PI / 2],
    [-hx, -hz, Math.PI],
    [hx, -hz, (3 * Math.PI) / 2],
  ];
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = start + (i / cornerSegments) * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      out.push({ x: cx + nx * rr, z: cz + nz * rr, nx, nz });
    }
  }
  return out;
}
