// CoForge-style agent moods: what the avatar's face shows while a task is being worked on.
// Derived from the node's live call and status, so the same face reads in the list, the map and
// the detail panel.

import type { ViewNode } from "../types/api";

export type Mood = "calm" | "focus" | "puzzled" | "angry" | "happy";

export const MOOD_LABEL: Record<Mood, string> = {
  calm: "待命",
  focus: "努力",
  puzzled: "困惑",
  angry: "出错",
  happy: "完成",
};

export function agentMood(node: Pick<ViewNode, "status" | "live"> | null | undefined, erroneous = false): Mood {
  if (!node) return "calm";
  const live = node.live ?? [];
  if (live.length) {
    const last = live[live.length - 1]!;
    if (last.tool === "思考") return "puzzled";
    if (last.error) return "angry";
    return "focus";
  }
  if (erroneous) return "angry";
  if (node.status === "resolved") return "happy";
  if (node.status === "in_progress") return "focus";
  return "calm";
}
