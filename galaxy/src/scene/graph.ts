// The scene's view of a snapshot: nodes and edges in one stable index order,
// with everything the instanced systems need precomputed. Pure.

import { drawnRelation, edgeKey, errorTargets } from "../lib/edges";
import { RELATION_COLOR, toneColor } from "../lib/palette";
import { hash01, type SpacePoint } from "../lib/space";
import type { Edge, Snapshot, ViewNode } from "../types/api";
import { discTilt, type Tilt } from "./orbits";

/** Body look codes shared with the shaders. */
const KIND_OPEN = 0;
export const KIND_PROGRESS = 1;
const KIND_RESOLVED = 2;
export const KIND_CANCELLED = 3;
export const KIND_GOAL = 4;

/** Relation codes shared with the edge shader. */
export const REL_PARENT = 0;
export const REL_AUDIT = 1;
const REL_SUPPORT = 2;
const REL_CHALLENGE = 3;
const REL_ERROR = 4;

const REL_CODE = { parent: REL_PARENT, audit: REL_AUDIT, support: REL_SUPPORT, challenge: REL_CHALLENGE, error: REL_ERROR } as const;

export interface SceneNode {
  id: string;
  /** Row in the node state texture. */
  i: number;
  node: ViewNode;
  p: SpacePoint;
  tone: string;
  kind: number;
  /** Targeted by an `error` edge and not resolved. */
  err: boolean;
  seed: number;
  tilt: Tilt;
  /** Height of the label anchor above the body centre. */
  lift: number;
}

type Vec3Tuple = [number, number, number];

interface SceneEdge {
  i: number;
  key: string;
  edge: Edge;
  rel: number;
  from: SceneNode;
  to: SceneNode;
  /** Quadratic Bezier control points. */
  p0: Vec3Tuple;
  p1: Vec3Tuple;
  p2: Vec3Tuple;
  color: string;
  seed: number;
  /** Chord length in world units. */
  len: number;
}

export interface SceneGraph {
  nodes: SceneNode[];
  edges: SceneEdge[];
  byId: Map<string, SceneNode>;
  goal: SceneNode | null;
  /** Radius of a sphere around the origin that holds every body (min 6). */
  extent: number;
  /** Any task has a live call. */
  live: boolean;
}

const EMPTY_GRAPH: SceneGraph = { nodes: [], edges: [], byId: new Map(), goal: null, extent: 6, live: false };

function kindOf(node: ViewNode): number {
  if (node.goal) return KIND_GOAL;
  if (node.status === "in_progress") return KIND_PROGRESS;
  if (node.status === "resolved") return KIND_RESOLVED;
  if (node.status === "cancelled") return KIND_CANCELLED;
  return KIND_OPEN;
}

/** Arc lift (fraction of the chord) per drawn relation. */
const LIFT = [0.12, 0, 0.05, 0.42, 0.015];

export function buildGraph(view: Snapshot | null, layout: Map<string, SpacePoint>): SceneGraph {
  if (!view || !view.ok || !view.nodes.length) return EMPTY_GRAPH;
  const errors = errorTargets(view.edges);
  const nodes: SceneNode[] = [];
  const byId = new Map<string, SceneNode>();
  let extent = 6;
  let live = false;
  for (const node of view.nodes) {
    const p = layout.get(node.id);
    if (!p) continue;
    const scene: SceneNode = {
      id: node.id,
      i: nodes.length,
      node,
      p,
      tone: toneColor(node.tone),
      kind: kindOf(node),
      err: !node.goal && errors.has(node.id) && node.status !== "resolved",
      seed: hash01(node.id),
      tilt: discTilt(node.id),
      lift: node.goal ? p.r * 1.3 : p.r * 1.15,
    };
    nodes.push(scene);
    byId.set(node.id, scene);
    extent = Math.max(extent, Math.hypot(p.x, p.y, p.z) + p.r);
    if (!node.goal && node.live.length) live = true;
  }
  const edges: SceneEdge[] = [];
  view.edges.forEach((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || from === to) return;
    const rel = REL_CODE[drawnRelation(edge.relation)];
    const p0: Vec3Tuple = [from.p.x, from.p.y, from.p.z];
    const p2: Vec3Tuple = [to.p.x, to.p.y, to.p.z];
    const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const lift = (LIFT[rel] ?? 0) * len;
    const p1: Vec3Tuple = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 + lift, (p0[2] + p2[2]) / 2];
    const key = edgeKey(edge, index);
    edges.push({
      i: edges.length,
      key,
      edge,
      rel,
      from,
      to,
      p0,
      p1,
      p2,
      color: rel === REL_PARENT ? to.tone : RELATION_COLOR[edge.relation],
      seed: hash01(key),
      len,
    });
  });
  const goal = nodes.find((node) => node.node.goal) ?? null;
  return { nodes, edges, byId, goal, extent, live };
}
