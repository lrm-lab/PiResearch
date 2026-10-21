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
      if (node.id === selected) value = 1.45;
      else if (!linked.has(node.id)) value = Math.min(value, DIM);
    }
    if (node.id === focus.hoveredId) value = Math.max(value, 1) * 1.2;
    out[node.i] = value;
  }
  return out;
}

export function edgeTargets(graph: SceneGraph, focus: FocusState): Float32Array {
  const out = new Float32Array(graph.edges.length).fill(1);
  const selected = focus.selectedId && graph.byId.has(focus.selectedId) ? focus.selectedId : null;
  for (const edge of graph.edges) {
    let value = 1;
    if (focus.lens) value = edge.rel === REL_PARENT ? 0.12 : 1.35;
    if (selected) {
      const touches = edge.edge.from === selected || edge.edge.to === selected;
      value = touches ? Math.max(value, 1.5) : value * DIM;
    }
    const hovered = focus.hoveredId && (edge.edge.from === focus.hoveredId || edge.edge.to === focus.hoveredId);
    if (hovered) value = Math.max(value, 1) * 1.7;
    out[edge.i] = value;
  }
  return out;
}
