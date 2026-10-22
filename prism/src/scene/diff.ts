// Snapshot diffing for the scene's motion: which tasks are new (they drop in) and which changed
// their status look (they flip). Pure: no three.js.

import { compareNodes } from "../lib/order";
import { taskTone, type TaskTone } from "../lib/status";
import type { Snapshot } from "../types/api";

/** What the card face shows as status: CoForge task tone (an incoming error edge wins). */
export type NodeSignature = Map<string, TaskTone>;

export interface SnapshotDiff {
  /** New task ids, in id order (the drop sequence). On the first snapshot: every task. */
  added: string[];
  /** Tasks present before whose status tone changed. */
  statusChanged: string[];
  removed: string[];
  /** Signature to pass as `prev` next time. */
  signature: NodeSignature;
}

/** The tone per task (goal excluded). */
export function signatureOf(view: Pick<Snapshot, "nodes" | "edges"> | null): NodeSignature {
  const signature: NodeSignature = new Map();
  if (!view) return signature;
  const erroneous = new Set<string>();
  for (const edge of view.edges ?? []) if (edge.relation === "error") erroneous.add(edge.to);
  const tasks = view.nodes.filter((node) => !node.goal).sort(compareNodes);
  for (const node of tasks) {
    if (signature.has(node.id)) continue;
    signature.set(node.id, taskTone(node.status, erroneous.has(node.id)));
  }
  return signature;
}

export function snapshotDiff(prev: NodeSignature | null, next: Pick<Snapshot, "nodes" | "edges"> | null): SnapshotDiff {
  const signature = signatureOf(next);
  const added: string[] = [];
  const statusChanged: string[] = [];
  const removed: string[] = [];
  for (const [id, tone] of signature) {
    const before = prev?.get(id);
    if (before === undefined) added.push(id);
    else if (before !== tone) statusChanged.push(id);
  }
  if (prev) for (const id of prev.keys()) if (!signature.has(id)) removed.push(id);
  return { added, statusChanged, removed, signature };
}
