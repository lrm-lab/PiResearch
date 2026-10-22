// Target brightness of every node and edge for the current focus state. Pure.
// 1 is normal, ~0.35 dimmed, above 1 brightened.

import { linkedIds, verificationIds } from "../lib/edges";
import type { SceneGraph } from "./graph";
import { REL_PARENT } from "./graph";

export interface FocusState {
  selectedId: string | null;
  hoveredId: string | null;
  lens: boolean;
}

export const DIM = 0.35;
// Selection reads through outline + dimming of the rest, so these lifts stay modest
// (shaders map 1..1.2 to the outline strength; nothing is pushed into HDR).
export const SELECT_LIFT = 1.2;
export const HOVER_LIFT = 1.12;
export const EDGE_LIFT = 1.2;
export const EDGE_HOVER_LIFT = 1.25;

export function nodeTargets(graph: SceneGraph, focus: FocusState): Float32Array {
  const out = new Float32Array(graph.nodes.length).fill(1);
  const raw = graph.edges.map((edge) => edge.edge);
  const lensIds = focus.lens ? verificationIds(raw) : null;
  const selected = focus.selectedId && graph.byId.has(focus.selectedId) ? focus.selectedId : null;
  const linked = selected ? linkedIds(raw, selected) : null;
  for (const node of graph.nodes) {
    let value = 1;
    if (lensIds && !lensIds.has(node.id)) value = 0.28;
    if (linked) {
      if (node.id === selected) value = SELECT_LIFT;
      else if (!linked.has(node.id)) value = Math.min(value, DIM);
    }
    if (node.id === focus.hoveredId) value = Math.max(value, 1) * HOVER_LIFT;
    out[node.i] = value;
  }
  return out;
}

export function edgeTargets(graph: SceneGraph, focus: FocusState): Float32Array {
  const out = new Float32Array(graph.edges.length).fill(1);
  const selected = focus.selectedId && graph.byId.has(focus.selectedId) ? focus.selectedId : null;
  for (const edge of graph.edges) {
    let value = 1;
    if (focus.lens) value = edge.rel === REL_PARENT ? 0.12 : 1.15;
    if (selected) {
      const touches = edge.edge.from === selected || edge.edge.to === selected;
      value = touches ? Math.max(value, EDGE_LIFT) : value * DIM;
    }
    const hovered = focus.hoveredId && (edge.edge.from === focus.hoveredId || edge.edge.to === focus.hoveredId);
    if (hovered) value = Math.max(value, EDGE_HOVER_LIFT);
    out[edge.i] = value;
  }
  return out;
}
