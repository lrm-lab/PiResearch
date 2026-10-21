// Port of the 2D child-row state (constellation/index.html childState, :1328-1337).

import { awaitingAgent, type ActivityNode } from "../lib/activity";

export type ChildStateKind = "resolved" | "cancelled" | "working" | "pending";

export interface ChildState {
  state: ChildStateKind;
  label: string;
}

/** `running === false` means the study ended; an absent `running` (single-trial mode) does not. */
export function childState(node: ActivityNode | null | undefined, view: { running?: boolean } | null | undefined): ChildState {
  const ended = Boolean(view && view.running === false);
  const pending: ChildState = { state: "pending", label: ended ? "待开始" : "准备中" };
  if (!node) return { state: "pending", label: "准备中" };
  if (node.status === "resolved") return { state: "resolved", label: "已完成" };
  if (node.status === "cancelled") return { state: "cancelled", label: "已取消" };
  if (awaitingAgent(node)) return pending;
  if (node.status === "in_progress" || (node.live || []).length) {
    return ended ? { state: "cancelled", label: "已停止" } : { state: "working", label: "工作中" };
  }
  return pending;
}

/** Goal summary line (2D `.node-summary`). */
export function goalSummary(view: { running?: boolean } | null | undefined, resolved: number, total: number): string {
  if (total > 0) return `已完成 ${resolved} / ${total} 项任务`;
  return view && view.running === true ? "正在拆解研究问题" : "尚无子任务";
}

/** Goal meta line (2D `.node-meta`): agent count, or waiting for assignment. */
export function goalMeta(nodes: readonly { goal?: boolean; agents?: readonly string[] }[]): string {
  const agents = new Set<string>();
  for (const node of nodes) if (!node.goal) for (const agent of node.agents || []) agents.add(agent);
  return agents.size ? `${agents.size} 个研究智能体` : "等待任务分配";
}
