// Ports of the 2D status helpers (constellation/index.html:443-445, 527-529,
// 782-799, 1158-1175). Keep these byte-for-byte equivalent in behaviour.

import type { LiveCall, NodeStatus, Relation, Step } from "../types/api";

export const STATUS: Record<string, string> = {
  open: "未开始",
  in_progress: "进行中",
  resolved: "已完成",
  cancelled: "已取消",
};

export const REL: Record<string, string> = {
  parent: "子节点",
  audit: "审核",
  support: "支持",
  challenge: "挑战",
  error: "错误",
};

export const TOOL: Record<string, string> = {
  web_search: "搜索",
  web_fetch: "打开",
  bash: "命令",
  read_file: "读取",
  create_file: "写入",
  submit_report: "提交",
  download_file: "下载",
  压缩: "压缩",
  思考: "思考",
};

/** Minimal shapes so the helpers accept snapshot payloads and test literals alike. */
export interface ActivityNode {
  id: string;
  goal?: boolean;
  status?: NodeStatus | string;
  agents?: readonly string[];
  live?: readonly Pick<LiveCall, "label" | "tool">[];
  steps?: readonly Step[];
  step_count?: number;
  steps_revision?: string;
}

export interface ActivitySource {
  ok?: boolean;
  running?: boolean;
  nodes?: readonly ActivityNode[];
}

export type GoalPhase = "planning" | "finalizing";
export interface GoalActivity {
  phase: GoalPhase;
  label: string;
}

/** Only while a home-mode run is live: planning, or finalising once every task is closed. */
export function goalActivity(source: ActivitySource | null | undefined): GoalActivity | null {
  if (!source || !source.ok || source.running !== true) return null;
  const tasks = (source.nodes || []).filter((node) => !node.goal);
  if (!tasks.length) return { phase: "planning", label: "拆解问题中" };
  if (tasks.some((node) => (node.live || []).length)) return null;
  if (!tasks.every((node) => node.status === "resolved" || node.status === "cancelled")) return null;
  return {
    phase: "finalizing",
    label: tasks.every((node) => node.status === "resolved") ? "整理报告中" : "汇总结果中",
  };
}

/** Changes whenever running, a status, the steps or the live calls change. */
export function liveKey(source: ActivitySource | null | undefined): string {
  return (
    `${source && source.running}:` +
    ((source && source.nodes) || [])
      .map(
        (node) =>
          `${node.id}:${node.status || ""}:${node.steps_revision || ""}:${node.step_count ?? ""}:${(node.live || [])
            .map((step) => step.label)
            .join("/")}`,
      )
      .join("|")
  );
}

/** Top-bar phase chip: 调研中 / 拆解问题中 / 整理报告中 / 汇总结果中 / 已结束. */
export function phaseLabel(source: ActivitySource | null | undefined): string {
  const activity = goalActivity(source);
  return activity ? activity.label : source && source.running ? "调研中" : "已结束";
}

/** Finished steps (`step_count`, falling back to loaded steps) plus live calls other than 思考. */
export function toolCount(node: ActivityNode): number {
  const done = node.step_count ?? (node.steps || []).length;
  const live = (node.live || []).filter((step) => step.tool && step.tool !== "思考").length;
  return done + live;
}

/** A task nobody has picked up yet. */
export function awaitingAgent(node: ActivityNode): boolean {
  return (
    !node.goal &&
    node.status !== "cancelled" &&
    node.status !== "resolved" &&
    !(node.agents && node.agents.length) &&
    toolCount(node) === 0
  );
}

export interface ViewLike extends ActivitySource {
  edges?: readonly { to: string; relation: Relation | string }[];
}

/** Any incoming `error` edge (2D `erroneous`). */
export function isErroneous(view: ViewLike | null | undefined, id: string): boolean {
  return ((view && view.edges) || []).some((edge) => edge.relation === "error" && edge.to === id);
}

/** The node's state text as on its 2D tab. */
export function stateText(view: ViewLike | null | undefined, node: ActivityNode): string {
  if (node.goal) return phaseLabel(view);
  if (isErroneous(view, node.id)) return "存在错误";
  if (awaitingAgent(node)) return "待分配";
  return STATUS[node.status || ""] || "研究任务";
}

/** Task progress for the goal / the top bar. */
export function progress(view: ActivitySource | null | undefined): { resolved: number; total: number } {
  const tasks = ((view && view.nodes) || []).filter((node) => !node.goal);
  return { resolved: tasks.filter((node) => node.status === "resolved").length, total: tasks.length };
}

/** "title，state，N 次工具调用" (goal: "title，state，R 项任务已完成，共 N 项"). */
export function ariaLabel(view: ViewLike | null | undefined, node: ActivityNode & { title?: string }): string {
  const state = stateText(view, node);
  if (node.goal) {
    const { resolved, total } = progress(view);
    return `${node.title}，${state}，${resolved} 项任务已完成，共 ${total} 项`;
  }
  return `${node.title}，${state}，${toolCount(node)} 次工具调用`;
}
