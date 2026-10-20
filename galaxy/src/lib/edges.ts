// Edge helpers. All take the edge list explicitly (no global view).

import type { Edge, Relation } from "../types/api";

/** Relations lit by the verification lens (核验透镜). `fusion` is drawn as `audit`. */
export const VERIFICATION_RELATIONS: readonly Relation[] = ["audit", "fusion", "support", "challenge", "error"];

/** `fusion` is valid but rendered like `audit` (2D index.html:1023). */
export function drawnRelation(relation: Relation): Exclude<Relation, "fusion"> {
  return relation === "fusion" ? "audit" : relation;
}

export function edgesByRelation(edges: readonly Edge[], relation: Relation | readonly Relation[]): Edge[] {
  const wanted = typeof relation === "string" ? [relation] : relation;
  return edges.filter((edge) => wanted.includes(edge.relation));
}

/** Group edges by their drawn relation, keeping edge order inside each group. */
export function groupByRelation(edges: readonly Edge[]): Record<Exclude<Relation, "fusion">, Edge[]> {
  const groups: Record<Exclude<Relation, "fusion">, Edge[]> = {
    parent: [],
    audit: [],
    support: [],
    challenge: [],
    error: [],
  };
  for (const edge of edges) groups[drawnRelation(edge.relation)].push(edge);
  return groups;
}

/** Ids of nodes targeted by at least one `error` edge. */
export function errorTargets(edges: readonly Edge[]): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) if (edge.relation === "error") ids.add(edge.to);
  return ids;
}

/** The node itself plus every node sharing an edge with it (2D `linkedIds`). */
export function linkedIds(edges: readonly Edge[], id: string): Set<string> {
  const ids = new Set([id]);
  for (const edge of edges) {
    if (edge.from === id || edge.to === id) {
      ids.add(edge.from);
      ids.add(edge.to);
    }
  }
  return ids;
}

/** Endpoints of the verification relations (what the lens keeps lit). */
export function verificationIds(edges: readonly Edge[]): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (!VERIFICATION_RELATIONS.includes(edge.relation)) continue;
    ids.add(edge.from);
    ids.add(edge.to);
  }
  return ids;
}

/** Stable key for an edge (from, to and relation are unique together in practice). */
export function edgeKey(edge: Edge, index?: number): string {
  return `${edge.from}>${edge.to}:${edge.relation}${index === undefined ? "" : `#${index}`}`;
}
