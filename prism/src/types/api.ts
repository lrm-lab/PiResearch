// Wire types for the existing constellation API (read-only).
// Source of truth: constellation/serve.py build_view / _cached_entry and
// notes/2d-frontend-spec.md sections 2-3.4. Verified against the dev backend.

/** Agent colour keys. `origin` is the goal, `pending` a task with no agent. */
export type Tone = "origin" | "green" | "cyan" | "violet" | "amber" | "blue" | "teal" | "pending";

/** `origin` for the goal, `hub` for the lowest-id node of each agent. */
export type Weight = "origin" | "hub" | "node";

/** Task-board resolution. The goal always has `""`. */
export type TaskStatus = "open" | "in_progress" | "resolved" | "cancelled";
export type NodeStatus = TaskStatus | "";

/** Graph relations (`fusion` is drawn like `audit`). */
export type Relation = "parent" | "audit" | "support" | "challenge" | "fusion" | "error";

export interface Edge {
  from: string;
  to: string;
  relation: Relation;
}

/** One finished tool call (or context compaction) from an agent's trajectory. */
export interface Step {
  agent?: string;
  /** Raw tool name, or the Chinese pseudo-tools "压缩" / "思考". */
  tool: string;
  /** e.g. "【查询】出让收入 87051亿元". */
  label: string;
  /** Up to 90 chars of the call argument. Absent on compaction steps. */
  hint?: string;
  /** Up to 180 chars of the result or error. */
  detail?: string;
  error: boolean;
  /** Folded consecutive navigation calls. */
  count?: number;
}

/**
 * An announced-but-unanswered call, or the `【思考】` placeholder
 * (`{tool:"思考",label:"【思考】",hint:"正在想下一步"}`).
 */
export interface LiveCall {
  tool: string;
  label: string;
  hint?: string;
  error: boolean;
  count: number;
}

export interface ChildRef {
  id: string;
  title: string;
}

/** A node as delivered by `/snapshot` (steps empty) or `/node?id=` (steps filled). */
export interface ViewNode {
  id: string;
  title: string;
  goal: boolean;
  /** 2D world px (min corner normalised to 140,140). */
  x: number;
  y: number;
  /** 2D px; grows with tool calls. */
  radius: number;
  tone: Tone;
  weight: Weight;
  agents: string[];
  status: NodeStatus;
  notes: string;
  children: ChildRef[];
  steps: Step[];
  live: LiveCall[];
  /** Snapshot/node payloads only (absent on legacy `/view`). */
  step_count?: number;
  steps_revision?: string;
  steps_loaded?: boolean;
}

export interface GoalRef {
  id: string;
  title: string;
}

/** `/snapshot` (and legacy `/view`) payload. */
export interface Snapshot {
  ok: boolean;
  message: string;
  goal: GoalRef | null;
  nodes: ViewNode[];
  edges: Edge[];
  /** Fallback radius (62). */
  radius: number;
  report: boolean;
  updated_at?: string;
  version?: number;
  /** Home mode only. Absent in single-trial mode. */
  running?: boolean;
  /** Home mode only: the research model id; empty for studies that predate the choice. */
  model?: string;
  revision?: string;
  detail_mode?: "on-demand";
}

/** `/node?id=` payload: one node with `steps` filled and `steps_loaded: true`. */
export type NodeDetail = ViewNode;

export interface ThumbnailNode {
  id: string;
  goal: boolean;
  x: number;
  y: number;
  radius: number;
  tone: Tone;
  status: NodeStatus;
}

/** `/thumbnail`: geometry only, no titles/notes/agents/goal (privacy rule). */
export interface Thumbnail {
  ok: boolean;
  message: string;
  version?: number;
  revision?: string;
  running?: boolean;
  edges: Edge[];
  nodes: ThumbnailNode[];
}

export type StudyStatus = "running" | "finished" | "failed";

/** One row of `/api/history` (`question` dropped with `?compact=1`). */
export interface HistoryRow {
  id: string;
  title: string;
  question?: string;
  status: StudyStatus;
  constellation: boolean;
  report: boolean;
  created_at: string;
  error: string;
  /** 2D page link, e.g. "/study/sessions/20261020-101500/1". */
  href: string;
  /** Research model id ("deepseek", "gpt-6.1-sol"); empty for studies that predate the choice. */
  model?: string;
}
