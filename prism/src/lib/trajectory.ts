// Run trajectory export: a snapshot plus per-node steps → Markdown / JSON, the download file
// names, the "interface cap" check for truncated step text, and a bounded-concurrency collector.
// Pure: no DOM, no store (the download itself lives in ./download).

import { stateText, toolCount, TOOL } from "./activity";
import { compareNodes } from "./order";
import type { LiveCall, Snapshot, Step, ViewNode } from "../types/api";

/** The server cuts a step's `hint` at 90 chars and `detail` at 180 chars (constellation/serve.py). */
export const HINT_CAP = 90;
export const DETAIL_CAP = 180;

/** "接口只返回前 N 字" when the text is at the server's cap or ends with an ellipsis; otherwise null. */
export function capNote(text: string | undefined, cap: number): string | null {
  if (!text) return null;
  const atCap = Array.from(text).length >= cap;
  const ellipsis = /(…|\.\.\.)\s*$/.test(text);
  return atCap || ellipsis ? `接口只返回前 ${cap} 字` : null;
}

export type StepsById = Record<string, readonly Step[] | undefined>;

export interface TrajectoryOptions {
  exportedAt?: Date;
  /** Study id, shown in the header and the JSON. */
  studyId?: string | null;
  /** Export only this task. */
  only?: string;
}

/** Tasks (goal excluded) in task order. */
export function orderedTasks(snapshot: Snapshot): ViewNode[] {
  return snapshot.nodes.filter((node) => !node.goal).sort(compareNodes);
}

/** "t12" → "T12"; ids without digits keep their upper-cased form. */
export function taskLabel(id: string): string {
  return id.toUpperCase();
}

/** Single-line text for a Markdown field; continuation lines are indented under the list item. */
function field(text: string, indent: string): string {
  return text.replace(/\r\n?/g, "\n").trim().replace(/\n/g, `\n${indent}`);
}

function stepLines(index: number, step: Step | LiveCall, live: boolean): string[] {
  const number = `${index}. `;
  const pad = " ".repeat(number.length);
  const count = step.count ?? 1;
  const head = [step.label || step.tool];
  if (count > 1) head.push(`×${count}`);
  if (step.error) head.push("(失败)");
  if (live) head.push("(进行中)");
  const lines = [`${number}${head.join(" ")}`];
  const tool = TOOL[step.tool];
  lines.push(`${pad}- 工具：${tool && tool !== step.tool ? `${tool} (${step.tool})` : step.tool}`);
  if (step.hint) lines.push(`${pad}- 参数：${field(step.hint, `${pad}  `)}`);
  const detail = "detail" in step ? step.detail : undefined;
  if (detail) lines.push(`${pad}- 结果：${field(detail, `${pad}  `)}`);
  return lines;
}

export function trajectoryMarkdown(snapshot: Snapshot, steps: StepsById, options: TrajectoryOptions = {}): string {
  const exportedAt = (options.exportedAt ?? new Date()).toISOString();
  const question = (snapshot.goal?.title ?? "").trim() || "未命名研究";
  const out: string[] = [`# ${question.replace(/\s*\n\s*/g, " ")}`, "", `导出时间：${exportedAt}`];
  if (options.studyId) out.push(`研究：${options.studyId}`);

  const tasks = orderedTasks(snapshot).filter((task) => options.only === undefined || task.id === options.only);
  for (const task of tasks) {
    const loaded = steps[task.id];
    out.push("", `## ${taskLabel(task.id)} ${task.title.replace(/\s*\n\s*/g, " ")}`, "");
    out.push(`- 状态：${stateText(snapshot, task)}`);
    out.push(`- Agent：${task.agents.length ? task.agents.join("、") : "待分配"}`);
    out.push(`- 工具调用：${toolCount(task)} 次`, "");
    const list = loaded ?? [];
    const live = task.live ?? [];
    let n = 0;
    for (const step of list) out.push(...stepLines(++n, step, false));
    for (const call of live) out.push(...stepLines(++n, call, true));
    if (!n) out.push(task.step_count && !loaded ? "（工具步骤没有读出来）" : "（没有工具步骤）");
  }
  return `${out.join("\n")}\n`;
}

export function trajectoryJson(snapshot: Snapshot, steps: StepsById, options: TrajectoryOptions = {}): string {
  const only = options.only;
  const nodes = only === undefined ? snapshot.nodes : snapshot.nodes.filter((node) => node.id === only || node.goal);
  const picked: Record<string, readonly Step[]> = {};
  for (const node of nodes) {
    const value = steps[node.id];
    if (value) picked[node.id] = value;
  }
  return JSON.stringify(
    {
      exported_at: (options.exportedAt ?? new Date()).toISOString(),
      study_id: options.studyId ?? null,
      snapshot: { ...snapshot, nodes },
      steps: picked,
    },
    null,
    2,
  );
}

/** `piresearch-sessions-20261020-120000-1-trajectory.md` (slashes in the study id become dashes). */
export function trajectoryFilename(studyId: string, ext: "md" | "json"): string {
  return `piresearch-${studyId.replace(/\/+/g, "-").replace(/^-+|-+$/g, "")}-trajectory.${ext}`;
}

export interface CollectOptions {
  ids: readonly string[];
  /** Resolves a node's steps; may throw. */
  fetchSteps: (id: string) => Promise<readonly Step[]>;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface Collected {
  steps: Record<string, readonly Step[]>;
  /** Ids whose fetch failed. */
  failed: string[];
  cancelled: boolean;
}

/** Fetch every id's steps with at most `concurrency` (default 4) requests in flight. */
export async function collectSteps(options: CollectOptions): Promise<Collected> {
  const { ids, fetchSteps, signal, onProgress } = options;
  const limit = Math.max(1, Math.min(options.concurrency ?? 4, 4));
  const steps: Record<string, readonly Step[]> = {};
  const failed: string[] = [];
  let next = 0;
  let done = 0;
  onProgress?.(0, ids.length);

  async function worker() {
    while (!signal?.aborted && next < ids.length) {
      const id = ids[next++]!;
      try {
        const value = await fetchSteps(id);
        if (signal?.aborted) return;
        steps[id] = value;
      } catch {
        if (signal?.aborted) return;
        failed.push(id);
      }
      done += 1;
      onProgress?.(done, ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return { steps, failed, cancelled: Boolean(signal?.aborted) };
}
