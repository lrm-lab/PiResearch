// Trajectory export state and actions. "导出全部轨迹" fetches /node?id= for every task that has
// steps (GET only, at most 4 at a time, cancellable), then saves Markdown or JSON.

import { create } from "zustand";
import { downloadText } from "../lib/download";
import {
  collectSteps,
  orderedTasks,
  taskLabel,
  trajectoryFilename,
  trajectoryJson,
  trajectoryMarkdown,
  type StepsById,
} from "../lib/trajectory";
import { findNode, useGalaxy } from "../store";

export type ExportFormat = "md" | "json";

interface ExportState {
  phase: "idle" | "running" | "error" | "done";
  done: number;
  total: number;
  message: string;
  format: ExportFormat;
}

export const useExport = create<ExportState>()(() => ({ phase: "idle", done: 0, total: 0, message: "", format: "md" }));

let controller: AbortController | null = null;
let doneTimer: ReturnType<typeof setTimeout> | undefined;

function save(format: ExportFormat, studyId: string, text: string): string {
  const name = trajectoryFilename(studyId, format);
  downloadText(name, text, format === "md" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8");
  return name;
}

function render(format: ExportFormat, steps: StepsById, only?: string): { studyId: string; text: string } | null {
  const { view, studyId } = useGalaxy.getState();
  if (!view || !studyId) return null;
  const options = { studyId, only, exportedAt: new Date() };
  return { studyId, text: format === "md" ? trajectoryMarkdown(view, steps, options) : trajectoryJson(view, steps, options) };
}

/** Markdown of one task, from the steps the panel already loaded. */
export function exportTask(id: string, format: ExportFormat = "md"): void {
  const { nodeDetails } = useGalaxy.getState();
  const out = render(format, { [id]: nodeDetails[id]?.steps }, id);
  if (out) save(format, out.studyId, out.text);
}

export async function exportAll(format: ExportFormat): Promise<void> {
  if (useExport.getState().phase === "running") return;
  const { view, fetchNodeSteps } = useGalaxy.getState();
  if (!view) return;
  clearTimeout(doneTimer);
  const ids = orderedTasks(view)
    .filter((task) => (task.step_count ?? 0) > 0)
    .map((task) => task.id);
  const own = new AbortController();
  controller = own;
  useExport.setState({ phase: "running", done: 0, total: ids.length, message: "", format });
  const result = await collectSteps({
    ids,
    fetchSteps: fetchNodeSteps,
    signal: own.signal,
    onProgress: (done, total) => useExport.setState({ done, total }),
  });
  if (controller === own) controller = null;
  if (result.cancelled) {
    useExport.setState({ phase: "idle" });
    return;
  }
  if (result.failed.length) {
    const names = result.failed.slice(0, 6).map(taskLabel).join("、");
    useExport.setState({
      phase: "error",
      message: `导出失败：${result.failed.length} 个任务的步骤没有读出来（${names}${result.failed.length > 6 ? " 等" : ""}）。`,
    });
    return;
  }
  const latest = useGalaxy.getState().view ?? view;
  const known = Object.fromEntries(Object.entries(result.steps).filter(([id]) => findNode(latest, id)));
  const out = render(format, known);
  if (!out) {
    useExport.setState({ phase: "idle" });
    return;
  }
  const name = save(format, out.studyId, out.text);
  useExport.setState({ phase: "done", message: `已导出 ${name}` });
  doneTimer = setTimeout(() => {
    if (useExport.getState().phase === "done") useExport.setState({ phase: "idle" });
  }, 4000);
}

export function cancelExport(): void {
  controller?.abort();
  controller = null;
  useExport.setState({ phase: "idle" });
}

export function dismissExport(): void {
  useExport.setState({ phase: "idle" });
}
