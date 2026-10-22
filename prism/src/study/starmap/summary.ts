// The one plain-language line under the question: "6 个智能体在研究 · 15/30 已完成 · 2 处有错误 · 3 个工具调用进行中".

import { isErroneous, progress } from "../../lib/activity";
import type { Snapshot } from "../../types/api";
import { agentRoster, tasksOf } from "../model";

export interface SummaryFacts {
  agents: number;
  resolved: number;
  total: number;
  errors: number;
  liveCalls: number;
  running: boolean;
}

export function summaryFacts(view: Snapshot | null): SummaryFacts {
  const tasks = tasksOf(view);
  const { resolved, total } = progress(view);
  return {
    agents: agentRoster(view).length,
    resolved,
    total,
    errors: tasks.filter((task) => task.status !== "resolved" && isErroneous(view, task.id)).length,
    liveCalls: tasks.reduce((sum, task) => sum + task.live.filter((call) => call.tool !== "思考").length, 0),
    running: view?.running === true,
  };
}

export function summaryLine(view: Snapshot | null): string {
  const f = summaryFacts(view);
  if (f.total === 0) return f.running ? "正在拆解问题，任务马上出现" : "这次研究没有留下任务";
  const parts: string[] = [];
  if (f.agents > 0) parts.push(`${f.agents} 个智能体${f.running ? "在研究" : "参与了研究"}`);
  parts.push(`${f.resolved}/${f.total} 已完成`);
  if (f.errors > 0) parts.push(`${f.errors} 处有错误`);
  if (f.liveCalls > 0) parts.push(`${f.liveCalls} 个工具调用进行中`);
  return parts.join(" · ");
}
