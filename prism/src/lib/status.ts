// The API's task status mapped onto CoForge's task-status language (colour + ring icon), so a
// PiResearch task reads like a CoForge task. Labels stay PiResearch's own Chinese copy (activity.ts).

import type { NodeStatus, StudyStatus } from "../types/api";
import { STATUS_HEX } from "./palette";

/** CoForge task status keys (features/tasks/task-status-icon.tsx). */
export type TaskTone = "todo" | "progress" | "review" | "done" | "closed" | "error";

/** open → todo, in_progress → in progress, resolved → done, cancelled → closed; an incoming error edge wins. */
export function taskTone(status: NodeStatus | string | undefined, erroneous = false): TaskTone {
  if (erroneous && status !== "resolved") return "error";
  switch (status) {
    case "in_progress":
      return "progress";
    case "resolved":
      return "done";
    case "cancelled":
      return "closed";
    default:
      return "todo";
  }
}

export function studyTone(status: StudyStatus | string | undefined): TaskTone {
  if (status === "running") return "progress";
  if (status === "finished") return "done";
  return "error";
}

export const TONE_HEX: Record<TaskTone, string> = STATUS_HEX;

/** Tailwind classes per tone: dot, text, soft badge. All read the status tokens. */
export const TONE_CLASS: Record<TaskTone, { dot: string; text: string; badge: string }> = {
  todo: { dot: "bg-status-todo", text: "text-status-todo", badge: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900" },
  progress: { dot: "bg-status-progress", text: "text-status-progress", badge: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900" },
  review: { dot: "bg-status-review", text: "text-status-review", badge: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900" },
  done: { dot: "bg-status-done", text: "text-status-done", badge: "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950 dark:text-green-300 dark:ring-green-900" },
  closed: { dot: "bg-status-closed", text: "text-status-closed", badge: "bg-neutral-50 text-neutral-700 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:ring-neutral-800" },
  error: { dot: "bg-status-error", text: "text-status-error", badge: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900" },
};

/** Ring fill per tone, as CoForge's TaskStatusIcon draws it. */
export const TONE_RING: Record<TaskTone, { fill: number; mark?: "check" | "cross" | "bang" }> = {
  todo: { fill: 0 },
  progress: { fill: 0.5 },
  review: { fill: 0.75 },
  done: { fill: 1, mark: "check" },
  closed: { fill: 1, mark: "cross" },
  error: { fill: 1, mark: "bang" },
};
