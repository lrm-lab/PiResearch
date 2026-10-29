// Pure view-model helpers for the study chrome (header, toolbar, list, detail panel, shortcuts).
// No React, no store, no DOM: everything here is unit-tested in model.test.ts.

import { isErroneous, REL } from "../lib/activity";
import { drawnRelation } from "../lib/edges";
import { compareNodes } from "../lib/order";
import { taskTone, type TaskTone } from "../lib/status";
import type { Edge, Relation, Snapshot, TaskStatus, Tone, ViewNode } from "../types/api";
import type { StudyView } from "./store";

export type StudyTab = StudyView;

// ---------------------------------------------------------------------------
// Tasks

/** Non-goal nodes in server task order. */
export function tasksOf(view: Snapshot | null): ViewNode[] {
  if (!view) return [];
  return view.nodes.filter((node) => !node.goal).sort(compareNodes);
}

/** A task stays visible unless every one of its agents is hidden (unassigned tasks always show). */
export function isVisible(node: Pick<ViewNode, "agents">, hidden: Readonly<Record<string, true>>): boolean {
  if (!node.agents.length) return true;
  return node.agents.some((agent) => !hidden[agent]);
}

export function visibleTasks(view: Snapshot | null, hidden: Readonly<Record<string, true>>): ViewNode[] {
  return tasksOf(view).filter((node) => isVisible(node, hidden));
}

export interface StatusGroup {
  status: TaskStatus;
  label: string;
  items: ViewNode[];
}

/** List groups in reading order: what is moving first, then what waits, then what is done. */
export const GROUP_ORDER: readonly { status: TaskStatus; label: string }[] = [
  { status: "in_progress", label: "进行中" },
  { status: "open", label: "未开始" },
  { status: "resolved", label: "已完成" },
  { status: "cancelled", label: "已取消" },
];

/** Groups tasks by status (unknown statuses count as 未开始), dropping empty groups. Keeps input order. */
export function groupTasks(tasks: readonly ViewNode[]): StatusGroup[] {
  const groups = GROUP_ORDER.map((group) => ({ ...group, items: [] as ViewNode[] }));
  for (const node of tasks) {
    const group = groups.find((entry) => entry.status === node.status) ?? groups[1]!;
    group.items.push(node);
  }
  return groups.filter((group) => group.items.length > 0);
}

/** The flat order the list shows (group by group), for arrow-key navigation. */
export function listOrder(tasks: readonly ViewNode[]): string[] {
  return groupTasks(tasks).flatMap((group) => group.items.map((node) => node.id));
}

/** The id after / before `current` in `order` (wrapping); the first / last when nothing is selected. */
export function stepSelection(order: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (!order.length) return null;
  const index = current === null ? -1 : order.indexOf(current);
  if (index < 0) return delta > 0 ? order[0]! : order[order.length - 1]!;
  return order[(index + delta + order.length) % order.length]!;
}

export function nodeTone(view: Snapshot | null, node: Pick<ViewNode, "id" | "status">): TaskTone {
  return taskTone(node.status, isErroneous(view, node.id));
}

/** Toolbar counters, in the order they are shown. Zero counts are kept so the row does not jump. */
export const COUNTER_TONES: readonly TaskTone[] = ["progress", "todo", "done", "error", "closed"];

export const TONE_LABEL: Record<TaskTone, string> = {
  todo: "未开始",
  progress: "进行中",
  review: "审核中",
  done: "已完成",
  closed: "已取消",
  error: "存在错误",
};

export function toneCounts(view: Snapshot | null, tasks: readonly ViewNode[]): Record<TaskTone, number> {
  const counts: Record<TaskTone, number> = { todo: 0, progress: 0, review: 0, done: 0, closed: 0, error: 0 };
  for (const node of tasks) counts[nodeTone(view, node)] += 1;
  return counts;
}

/** Segments of the goal's progress bar: done → in progress → error → todo → closed, empty ones dropped. */
export const SEGMENT_TONES: readonly TaskTone[] = ["done", "progress", "error", "todo", "closed"];

export function progressSegments(view: Snapshot | null): { tone: TaskTone; count: number }[] {
  const counts = toneCounts(view, tasksOf(view));
  return SEGMENT_TONES.map((tone) => ({ tone, count: counts[tone] })).filter((segment) => segment.count > 0);
}

// ---------------------------------------------------------------------------
// Agents

export interface AgentSummary {
  agent: string;
  tone: Tone;
  /** Tasks the agent owns. */
  tasks: number;
  resolved: number;
  /** Tasks in progress. */
  active: number;
}

/** Every agent in task order, with its tone (from its first task) and task counts. */
export function agentRoster(view: Snapshot | null): AgentSummary[] {
  const byAgent = new Map<string, AgentSummary>();
  for (const node of tasksOf(view)) {
    for (const agent of node.agents) {
      let entry = byAgent.get(agent);
      if (!entry) {
        entry = { agent, tone: node.tone, tasks: 0, resolved: 0, active: 0 };
        byAgent.set(agent, entry);
      }
      entry.tasks += 1;
      if (node.status === "resolved") entry.resolved += 1;
      if (node.status === "in_progress") entry.active += 1;
    }
  }
  return [...byAgent.values()];
}

// ---------------------------------------------------------------------------
// Relations

export type DrawnRelation = Exclude<Relation, "fusion">;

/** Legend / chip order: structure first, then verification. */
export const RELATION_ORDER: readonly DrawnRelation[] = ["parent", "audit", "support", "challenge", "error"];

/** Legend copy for each drawn relation. */
export const RELATION_LEGEND: Record<DrawnRelation, { label: string; hint: string }> = {
  parent: { label: "拆分", hint: "上级任务拆出的子任务" },
  audit: { label: "审核", hint: "核验方复查另一项任务" },
  support: { label: "支持", hint: "核验结果支持原结论" },
  challenge: { label: "挑战", hint: "抽样挑战原结论" },
  error: { label: "错误", hint: "核验发现原结论有误" },
};

export interface RelationLink {
  relation: DrawnRelation;
  /** "out": this task → other; "in": other → this task. */
  direction: "out" | "in";
  other: string;
  title: string;
  /** Chip text, e.g. "审核" / "被审核" / "上级任务". */
  phrase: string;
}

const PHRASE: Record<"out" | "in", Record<DrawnRelation, string>> = {
  out: { parent: "子任务", audit: "审核", support: "支持", challenge: "挑战", error: "指出错误" },
  in: { parent: "上级任务", audit: "被审核", support: "被支持", challenge: "被挑战", error: "被指出错误" },
};

export function relationPhrase(relation: DrawnRelation, direction: "out" | "in"): string {
  return PHRASE[direction][relation];
}

/**
 * The 关联 row of a task: its parent (incoming parent edge) and every verification edge in either
 * direction. Outgoing parent edges are the 子任务 list, so they are left out. Duplicates (same
 * relation, direction and other end) collapse; order follows RELATION_ORDER, then the other task's order.
 */
export function relationsOf(view: Snapshot | null, id: string): RelationLink[] {
  if (!view) return [];
  const titles = new Map(view.nodes.map((node) => [node.id, node] as const));
  const seen = new Set<string>();
  const links: RelationLink[] = [];
  for (const edge of view.edges) {
    const direction = edge.from === id ? "out" : edge.to === id ? "in" : null;
    if (!direction || edge.from === edge.to) continue;
    const relation = drawnRelation(edge.relation);
    if (relation === "parent" && direction === "out") continue;
    const other = direction === "out" ? edge.to : edge.from;
    const key = `${relation}:${direction}:${other}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = titles.get(other);
    links.push({
      relation,
      direction,
      other,
      title: node ? (node.goal ? "研究主问题" : node.title || other) : other,
      phrase: relationPhrase(relation, direction),
    });
  }
  const rank = (link: RelationLink) => RELATION_ORDER.indexOf(link.relation);
  const order = (link: RelationLink) => titles.get(link.other) ?? { id: link.other };
  return links.sort((a, b) => rank(a) - rank(b) || compareNodes(order(a), order(b)));
}

/** Verification edges touching a task, counted per drawn relation (list row badges). */
export function relationCounts(edges: readonly Edge[], id: string): { relation: DrawnRelation; count: number }[] {
  const counts = new Map<DrawnRelation, number>();
  for (const edge of edges) {
    if (edge.from !== id && edge.to !== id) continue;
    const relation = drawnRelation(edge.relation);
    if (relation === "parent") continue;
    counts.set(relation, (counts.get(relation) ?? 0) + 1);
  }
  return RELATION_ORDER.filter((relation) => counts.has(relation)).map((relation) => ({ relation, count: counts.get(relation)! }));
}

export function relationName(relation: DrawnRelation): string {
  return REL[relation] ?? relation;
}

// ---------------------------------------------------------------------------
// Keyboard

export interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  /** Focus is in a text field (input, textarea, select, contentEditable). */
  typing?: boolean;
}

export interface KeyContext {
  tab: StudyTab;
  hasReport: boolean;
}

export type KeyAction =
  | { kind: "fit" }
  | { kind: "escape" }
  | { kind: "help" }
  | { kind: "tab"; tab: StudyTab }
  | { kind: "step"; delta: 1 | -1 };

/**
 * Page shortcuts: F fit the map · Esc · ? help · 1/2/3 tabs · ↑/↓ (and J/K) in the task list.
 * (Arrow keys on the map are handled by the map itself: they move between stars.) Nothing fires
 * while typing, composing (IME), or with Cmd/Ctrl/Alt held.
 */
export function keyAction(input: KeyInput, context: KeyContext): KeyAction | null {
  if (input.defaultPrevented || input.isComposing || input.typing) return null;
  if (input.metaKey || input.ctrlKey || input.altKey) return null;
  if (input.key === "Escape") return { kind: "escape" };
  if (input.key === "ArrowDown" || input.key === "ArrowUp") {
    if (context.tab !== "tasks") return null;
    return { kind: "step", delta: input.key === "ArrowDown" ? 1 : -1 };
  }
  if (input.repeat) return null;
  if (input.key === "?") return { kind: "help" };
  const key = input.key.toLowerCase();
  switch (key) {
    case "1":
      return { kind: "tab", tab: "map" };
    case "2":
      return { kind: "tab", tab: "tasks" };
    case "3":
      return context.hasReport ? { kind: "tab", tab: "report" } : null;
    case "f":
      return context.tab === "map" ? { kind: "fit" } : null;
    case "j":
      return context.tab === "tasks" ? { kind: "step", delta: 1 } : null;
    case "k":
      return context.tab === "tasks" ? { kind: "step", delta: -1 } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// URL

const TABS: readonly StudyTab[] = ["map", "tasks", "report"];

/** `?tab=tasks|report` (map is the default and is not written). */
export function tabFromSearch(search: string): StudyTab | null {
  const value = new URLSearchParams(search).get("tab");
  return TABS.includes(value as StudyTab) ? (value as StudyTab) : null;
}

/** The search string with `tab` set (or removed for the default), keeping every other parameter. */
export function searchWithTab(search: string, tab: StudyTab, defaultTab: StudyTab): string {
  const params = new URLSearchParams(search);
  if (tab === defaultTab) params.delete("tab");
  else params.set("tab", tab);
  const next = params.toString();
  return next ? `?${next}` : "";
}

// ---------------------------------------------------------------------------
// Report

/** "3 章 · 约 4 分钟" (about 450 characters a minute). */
export function readingMeta(markdown: string): string {
  const chapters = (markdown.match(/^## /gm) || []).length;
  const chars = markdown.replace(/\]\([^)]*\)|[#>*|`\-\s]/g, "").length;
  const minutes = Math.max(1, Math.round(chars / 450));
  return `${chapters ? `${chapters} 章 · ` : ""}约 ${minutes} 分钟`;
}

/** Steps shown above the fold of the terminal before "显示更早的 N 步". */
export const TERMINAL_TAIL = 40;
