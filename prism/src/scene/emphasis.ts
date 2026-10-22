// Who is lit, dimmed or ghosted: hover, selection, the verification lens and the agent filter.
// Pure: no three.js; the components ease toward these targets every frame.

import { VERIFICATION_RELATIONS } from "../lib/edges";
import type { Edge } from "../types/api";

export interface FocusState {
  hoveredId: string | null;
  selectedId: string | null;
  lens: boolean;
  /** Endpoints of verification relations. */
  verification: ReadonlySet<string>;
  /** Tasks whose agents are all hidden by the toolbar filter. */
  hidden: ReadonlySet<string>;
}

/** A task is hidden when it has agents and every one of them is filtered out. */
export function isAgentHidden(agents: readonly string[] | undefined, hiddenAgents: Readonly<Record<string, true>>): boolean {
  return !!agents && agents.length > 0 && agents.every((agent) => hiddenAgents[agent]);
}

export function hiddenIds(nodes: readonly { id: string; agents?: readonly string[] }[], hiddenAgents: Readonly<Record<string, true>>): Set<string> {
  const ids = new Set<string>();
  if (!Object.keys(hiddenAgents).length) return ids;
  for (const node of nodes) if (isAgentHidden(node.agents, hiddenAgents)) ids.add(node.id);
  return ids;
}

export interface NodeEmphasis {
  /** Target opacity 0…1. */
  opacity: number;
  /** Sink into a ghost (hidden agent). */
  sink: boolean;
}

export const GHOST_OPACITY = 0.22;
export const LENS_DIM = 0.16;

export function nodeEmphasis(id: string, state: FocusState): NodeEmphasis {
  if (state.hidden.has(id)) return { opacity: GHOST_OPACITY, sink: true };
  if (state.lens && !state.verification.has(id)) return { opacity: LENS_DIM, sink: false };
  return { opacity: 1, sink: false };
}

export interface EdgeEmphasis {
  opacity: number;
  /** Highlight 0…1 (wider, brighter). */
  hi: number;
}

export function edgeEmphasis(edge: Edge, state: FocusState): EdgeEmphasis {
  const touches = (id: string | null) => id !== null && (edge.from === id || edge.to === id);
  const verification = VERIFICATION_RELATIONS.includes(edge.relation);
  if (state.hidden.has(edge.from) || state.hidden.has(edge.to)) return { opacity: 0.1, hi: 0 };
  if (state.lens && !verification) return { opacity: 0.07, hi: 0 };
  const hi = touches(state.hoveredId) || touches(state.selectedId) ? 1 : 0;
  if (hi) return { opacity: 1, hi };
  // Something is hovered: the rest steps back a little so the hovered relations read.
  if (state.hoveredId !== null) return { opacity: 0.45, hi: 0 };
  return { opacity: 1, hi: state.lens ? 0.35 : 0 };
}
