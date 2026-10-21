// A study's thumbnail turned into point and line buffers for one small galaxy.
// Pure and deterministic (seeded by the study id), no three.js import so it
// can be unit tested. Node positions come from lib/space liftLayout, scaled
// to fit the gallery disc; the dust and spiral arms are decoration only.

import { gauss, rng } from "../lib/math";
import { hash01, liftLayout } from "../lib/space";
import { RELATION_COLOR, TONE_COLOR, toneColor } from "../lib/palette";
import type { NodeStatus, Thumbnail } from "../types/api";

export const KIND_DUST = 0;
export const KIND_NODE = 1;
export const KIND_CORE = 2;

const STATE_NONE = 0;
const STATE_OPEN = 1;
const STATE_ACTIVE = 2;
const STATE_RESOLVED = 3;
const STATE_CANCELLED = 4;

export interface GalaxyGeometry {
  /** Number of points. */
  count: number;
  position: Float32Array;
  color: Float32Array;
  /** Sprite diameter in world units. */
  size: Float32Array;
  kind: Float32Array;
  /** Per-point random in [0, 1) for twinkle offsets. */
  phase: Float32Array;
  /** Node status code (STATE_*), 0 for dust and the core. */
  state: Float32Array;
  /** LineSegments vertex pairs. */
  edgePosition: Float32Array;
  edgeColor: Float32Array;
  /** Core glow colour (linear 0..1). */
  core: [number, number, number];
  /** True when the thumbnail had a graph. */
  hasGraph: boolean;
  /** Task nodes (goal excluded). */
  tasks: number;
}

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const GAUSS_MIN = 1e-6;

function stateOf(status: NodeStatus): number {
  switch (status) {
    case "open":
      return STATE_OPEN;
    case "in_progress":
      return STATE_ACTIVE;
    case "resolved":
      return STATE_RESOLVED;
    case "cancelled":
      return STATE_CANCELLED;
    default:
      return STATE_NONE;
  }
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [1, 1, 1];
const PROTO: RGB = hexToRgb("#7f9cc8");

interface Point {
  p: [number, number, number];
  c: RGB;
  s: number;
  k: number;
  st: number;
}

export interface BuildOptions {
  /** Disc radius in world units. */
  radius?: number;
  /** Spiral dust particle count. */
  dust?: number;
}

/**
 * Buffers for one study. `thumb` may be null (not loaded yet) or `ok:false`
 * (no graph): the galaxy is then a proto-galaxy, a core with spiral dust.
 */
export function buildGalaxy(thumb: Thumbnail | null | undefined, seed: string, options: BuildOptions = {}): GalaxyGeometry {
  const radius = options.radius ?? 1.25;
  const dustCount = options.dust ?? 560;
  const next = rng(Math.floor(hash01(seed) * 4294967296));
  const nodes = thumb && thumb.ok ? thumb.nodes ?? [] : [];
  const edges = thumb && thumb.ok ? thumb.edges ?? [] : [];
  const hasGraph = nodes.length > 0;
  const lifted = liftLayout(nodes, edges, seed);

  // Fit the lifted layout into the disc.
  let extent = 0;
  for (const point of lifted.values()) extent = Math.max(extent, Math.hypot(point.x, point.z));
  const scale = extent > 1e-6 ? (radius * 0.86) / extent : 1;
  const yScale = Math.min(1, scale * 1.6);

  const points: Point[] = [];
  const toneRgb = new Map<string, RGB>();
  const palette: RGB[] = [];
  const goal = nodes.find((node) => node.goal);
  const coreTone: RGB = goal ? hexToRgb(toneColor(goal.tone)) : PROTO;
  const positions = new Map<string, [number, number, number]>();
  let tasks = 0;

  for (const node of nodes) {
    const lift = lifted.get(node.id);
    if (!lift) continue;
    const at: [number, number, number] = [lift.x * scale, lift.y * yScale, lift.z * scale];
    positions.set(node.id, at);
    const rgb = toneRgb.get(node.tone) ?? hexToRgb(toneColor(node.tone));
    toneRgb.set(node.tone, rgb);
    if (node.goal) continue;
    tasks += 1;
    palette.push(rgb);
    const grow = Math.min(1, Math.max(0, (node.radius - 40) / 60));
    const st = stateOf(node.status);
    points.push({ p: at, c: rgb, s: 0.15 + 0.11 * grow, k: KIND_NODE, st });
    // A small cloud of dust around each body, in its tone.
    const cloud = 10 + Math.round(10 * grow);
    for (let i = 0; i < cloud; i += 1) {
      const spread = 0.07 + 0.06 * grow;
      points.push({
        p: [at[0] + gauss(next, GAUSS_MIN) * spread, at[1] + gauss(next, GAUSS_MIN) * spread * 0.5, at[2] + gauss(next, GAUSS_MIN) * spread],
        c: mix(rgb, WHITE, next() * 0.25),
        s: 0.025 + next() * 0.04,
        k: KIND_DUST,
        st,
      });
    }
  }
  if (!palette.length) palette.push(PROTO, hexToRgb(TONE_COLOR.cyan), hexToRgb(TONE_COLOR.violet));

  // Two (sometimes three) logarithmic spiral arms plus a diffuse halo.
  const arms = next() < 0.3 ? 3 : 2;
  const twist = 2.6 + next() * 1.6;
  const tilt = next() * Math.PI * 2;
  for (let i = 0; i < dustCount; i += 1) {
    const halo = i % 5 === 0;
    const t = Math.pow(next(), halo ? 0.6 : 0.85);
    const r = 0.08 + t * radius * (halo ? 1.15 : 1.05);
    const arm = Math.floor(next() * arms);
    const theta = tilt + (arm / arms) * Math.PI * 2 + Math.log(1 + t * 6) * twist + gauss(next, GAUSS_MIN) * (halo ? 1.2 : 0.22);
    const thick = (1 - t) * 0.12 + 0.025;
    const c = mix(palette[Math.floor(next() * palette.length)]!, WHITE, Math.max(0, 0.65 - t) * 0.9);
    points.push({
      p: [Math.cos(theta) * r, gauss(next, GAUSS_MIN) * thick, Math.sin(theta) * r],
      c: halo ? mix(c, PROTO, 0.4) : c,
      s: (halo ? 0.026 : 0.034) + next() * (halo ? 0.034 : 0.06) * (1 - t * 0.5),
      k: KIND_DUST,
      st: STATE_NONE,
    });
  }

  // The core: one bright sprite at the goal (or the centre).
  const goalAt = (goal && positions.get(goal.id)) || [0, 0, 0];
  points.push({ p: goalAt, c: mix(coreTone, WHITE, 0.35), s: hasGraph ? 0.95 : 0.75, k: KIND_CORE, st: STATE_NONE });

  const count = points.length;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const kind = new Float32Array(count);
  const phase = new Float32Array(count);
  const state = new Float32Array(count);
  points.forEach((point, index) => {
    position.set(point.p, index * 3);
    color.set(point.c, index * 3);
    size[index] = point.s;
    kind[index] = point.k;
    phase[index] = next();
    state[index] = point.st;
  });

  const edgePositions: number[] = [];
  const edgeColors: number[] = [];
  const toneOf = new Map(nodes.map((node) => [node.id, node.tone]));
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const parent = edge.relation === "parent";
    const rgb = parent ? hexToRgb(toneColor(toneOf.get(edge.to))) : hexToRgb(RELATION_COLOR[edge.relation] ?? RELATION_COLOR.parent);
    const strength = parent ? 0.42 : 0.26;
    edgePositions.push(...from, ...to);
    for (let i = 0; i < 2; i += 1) edgeColors.push(rgb[0] * strength, rgb[1] * strength, rgb[2] * strength);
  }

  return {
    count,
    position,
    color,
    size,
    kind,
    phase,
    state,
    edgePosition: new Float32Array(edgePositions),
    edgeColor: new Float32Array(edgeColors),
    core: coreTone,
    hasGraph,
    tasks,
  };
}
