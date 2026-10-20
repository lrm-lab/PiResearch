// Lift of the server's 2D layout into the galaxy (DESIGN.md section 2).
// Pure and deterministic: the result depends only on id, x, y, radius,
// the first agent, parent edges and the goal title, never on input order.

import type { Edge } from "../types/api";

export interface SpaceInputNode {
  id: string;
  goal?: boolean;
  x: number;
  y: number;
  radius: number;
  agents?: readonly string[];
}

export interface SpacePoint {
  id: string;
  /** World coordinates. Y is the disc thickness axis. */
  x: number;
  y: number;
  z: number;
  /** Body radius in world units. */
  r: number;
  /** Parent-edge depth from the goal (goal 0, its children 1). */
  depth: number;
}

const encoder = new TextEncoder();

/** 32-bit FNV-1a over the UTF-8 bytes, mapped to [0, 1). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of encoder.encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** Task body radius from the 2D px radius. */
export function bodyRadius(radius: number, goal: boolean): number {
  return goal ? 0.55 + 0.004 * radius : 0.12 + 0.0045 * radius;
}

/** The node's cluster: its first agent, or its own id when it has none. */
function clusterKey(node: SpaceInputNode): string {
  const agent = node.agents && node.agents[0];
  return agent ? agent : node.id;
}

/**
 * Parent-edge depth of every node from `goalId` (BFS, so the shortest chain
 * wins and edge order does not matter). Tasks the goal cannot reach get 1,
 * matching the 2D layout's level-1 rule.
 */
export function parentDepths(
  nodes: readonly SpaceInputNode[],
  edges: readonly Edge[],
  goalId: string | null,
): Map<string, number> {
  const children = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.relation !== "parent") continue;
    let set = children.get(edge.from);
    if (!set) children.set(edge.from, (set = new Set()));
    set.add(edge.to);
  }
  const depth = new Map<string, number>();
  if (goalId !== null) {
    depth.set(goalId, 0);
    let frontier = [goalId];
    for (let level = 1; frontier.length; level += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const child of children.get(id) ?? []) {
          if (depth.has(child)) continue;
          depth.set(child, level);
          next.push(child);
        }
      }
      frontier = next;
    }
  }
  for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, node.goal ? 0 : 1);
  return depth;
}

/**
 * World position and size of every node, keyed by id.
 * X = (x - goal.x) / 100, Z = (y - goal.y) / 100,
 * Y = -0.35 (depth - 1) + 0.9 (hash(goalTitle|cluster) - 0.5) + 0.25 (hash(id) - 0.5),
 * and the goal sits at the origin.
 */
export function liftLayout(
  nodes: readonly SpaceInputNode[],
  edges: readonly Edge[],
  goalTitle: string,
): Map<string, SpacePoint> {
  const goal = pickGoal(nodes);
  const origin = goal ? { x: goal.x, y: goal.y } : centroid(nodes);
  const depths = parentDepths(nodes, edges, goal ? goal.id : null);
  const out = new Map<string, SpacePoint>();
  for (const node of nodes) {
    const isGoal = goal !== null && node.id === goal.id;
    const depth = depths.get(node.id) ?? 1;
    const y = isGoal
      ? 0
      : -0.35 * (depth - 1) +
        0.9 * (hash01(`${goalTitle}|${clusterKey(node)}`) - 0.5) +
        0.25 * (hash01(node.id) - 0.5);
    out.set(node.id, {
      id: node.id,
      x: isGoal ? 0 : (node.x - origin.x) / 100,
      y,
      z: isGoal ? 0 : (node.y - origin.y) / 100,
      r: bodyRadius(node.radius, isGoal),
      depth,
    });
  }
  return out;
}

function pickGoal(nodes: readonly SpaceInputNode[]): SpaceInputNode | null {
  let best: SpaceInputNode | null = null;
  for (const node of nodes) {
    if (!node.goal) continue;
    if (best === null || node.id < best.id) best = node;
  }
  return best;
}

function centroid(nodes: readonly SpaceInputNode[]): { x: number; y: number } {
  if (!nodes.length) return { x: 0, y: 0 };
  // Sum in id order so float rounding does not depend on input order.
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let sx = 0;
  let sy = 0;
  for (const node of sorted) {
    sx += node.x;
    sy += node.y;
  }
  return { x: sx / sorted.length, y: sy / sorted.length };
}
