// Pure helpers for the home page: captions, ordering, row merging and the
// thumbnail signature. Mirrors constellation/home.html (caption, when, signature).

import { APP_BASE, prismStudyHref } from "../lib/api";
import type { HistoryRow, Thumbnail, ThumbnailNode } from "../types/api";

export const STATUS_LABEL: Record<string, string> = { running: "进行中", finished: "已完成", failed: "未完成" };

export const HISTORY_FAILED = "历史暂未读出，正在重试。";
export const SUBMIT_FAILED = "没有提交成功。";
export const SUBMIT_NETWORK = "没有提交成功。刷新后再试一次。";
export const DELETE_FAILED = "删除失败，请重试。";
export const DELETE_NETWORK = "连接失败，研究尚未删除。请重试。";
export const DELETE_NOTE_RUNNING = "研究仍在进行。删除会停止任务，并移除任务图、报告和运行记录。此操作无法撤销。";
export const DELETE_NOTE_DONE = "任务图、报告和运行记录会一起移除。此操作无法撤销。";

const MAX_HISTORY_DELAY_MS = 30000;
const MAX_HISTORY_FAILURES = 4;

/** `min(30000, 3000 * 2^failures)` (spec 2.2). */
export function historyDelay(failures: number): number {
  return Math.min(MAX_HISTORY_DELAY_MS, 3000 * 2 ** Math.min(failures, MAX_HISTORY_FAILURES));
}

export function nextFailures(failures: number): number {
  return Math.min(MAX_HISTORY_FAILURES, failures + 1);
}

/** "YYYY-MM-DD HH:mm" in local time, "" for a missing or bad stamp. */
export function formatWhen(stamp: string | undefined | null): string {
  if (!stamp) return "";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** True when the caption should say 没有任务图 (finished or failed without a graph). */
export function missingGraph(row: Pick<HistoryRow, "constellation" | "status">): boolean {
  return !row.constellation && row.status !== "running";
}

/** "status · 没有任务图? · YYYY-MM-DD HH:mm", as on the 2D cards. */
export function captionLine(row: Pick<HistoryRow, "status" | "constellation" | "created_at">): string {
  const bits = [STATUS_LABEL[row.status] ?? row.status];
  if (missingGraph(row)) bits.push("没有任务图");
  const time = formatWhen(row.created_at);
  if (time) bits.push(time);
  return bits.join(" · ");
}

export function rowTitle(row: Pick<HistoryRow, "title" | "id">): string {
  return row.title || row.id;
}

/**
 * The Prism page for a POST /api/questions `href` ("/study/<id>").
 * Ids keep their slashes. Anything else falls back to the Prism home.
 */
export function prismHrefFromApi(href: string | undefined | null): string {
  if (!href) return APP_BASE;
  if (href.startsWith(APP_BASE)) return href;
  const match = /^\/study\/(.+?)\/?$/.exec(href);
  return match ? prismStudyHref(match[1]!) : APP_BASE;
}

/** "/api/studies/<encodeURI(id)>" for DELETE (encodeURI keeps the slashes). */
export function deleteUrl(id: string): string {
  return `/api/studies/${encodeURI(id)}`;
}

function stampOf(row: HistoryRow): number {
  const value = new Date(row.created_at).getTime();
  return Number.isNaN(value) ? -Infinity : value;
}

/** `created_at` desc; ties keep the server order. */
export function sortRows(rows: readonly HistoryRow[]): HistoryRow[] {
  return rows
    .map((row, index) => ({ row, index, stamp: stampOf(row) }))
    .sort((a, b) => (b.stamp === a.stamp ? a.index - b.index : b.stamp > a.stamp ? 1 : -1))
    .map((entry) => entry.row);
}

function sameRow(a: HistoryRow, b: HistoryRow): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.status === b.status &&
    a.constellation === b.constellation &&
    a.report === b.report &&
    a.created_at === b.created_at &&
    a.error === b.error &&
    a.href === b.href
  );
}

/**
 * Sorted rows for a fresh history payload, reusing the previous object for
 * every unchanged study so memoised views keep their identity.
 */
export function mergeRows(previous: readonly HistoryRow[] | null, next: readonly HistoryRow[]): HistoryRow[] {
  const byId = new Map((previous ?? []).map((row) => [row.id, row]));
  const merged = sortRows(next).map((row) => {
    const old = byId.get(row.id);
    return old && sameRow(old, row) ? old : row;
  });
  if (previous && previous.length === merged.length && merged.every((row, index) => row === previous[index])) {
    return previous as HistoryRow[];
  }
  return merged;
}

export interface Rows {
  running: HistoryRow[];
  done: HistoryRow[];
}

/** 调研中 holds `running`; 已完成 holds everything else (failed included). */
export function splitRows(rows: readonly HistoryRow[]): Rows {
  const running: HistoryRow[] = [];
  const done: HistoryRow[] = [];
  for (const row of rows) (row.status === "running" ? running : done).push(row);
  return { running, done };
}

/** Geometry signature: ids, rounded x/y/r, tone, status and edges (2D `signature` plus status). */
export function thumbSignature(thumb: Thumbnail | null | undefined): string {
  if (!thumb || !thumb.ok) return "empty";
  const nodes = (thumb.nodes ?? [])
    .map((node) => `${node.id}:${Math.round(node.x)}:${Math.round(node.y)}:${Math.round(node.radius || 0)}:${node.tone}:${node.status}`)
    .join(",");
  const edges = (thumb.edges ?? []).map((edge) => `${edge.from}${edge.relation}${edge.to}`).join(",");
  return `${nodes}|${edges}`;
}

export interface ThumbStats {
  tasks: number;
  resolved: number;
  active: number;
}

export function thumbStats(thumb: Thumbnail | null | undefined): ThumbStats | null {
  if (!thumb || !thumb.ok || !thumb.nodes?.length) return null;
  let tasks = 0;
  let resolved = 0;
  let active = 0;
  for (const node of thumb.nodes) {
    if (node.goal) continue;
    tasks += 1;
    if (node.status === "resolved") resolved += 1;
    if (node.status === "in_progress") active += 1;
  }
  return { tasks, resolved, active };
}

/** Smallest span (layout units) a 2D thumbnail is fitted to, so a lone node stays a modest dot. */
export const THUMB_MIN_SPAN = 600;
/** Largest drawn node radius, as a share of the fitted span. */
export const THUMB_MAX_RADIUS = 0.08;
const THUMB_PAD = 36;

export interface ThumbFrame {
  /** SVG viewBox: x, y, width, height. */
  viewBox: [number, number, number, number];
  /** Drawn radius per node (same order as the input). */
  radii: number[];
  /** Edge stroke width. */
  weight: number;
}

/**
 * Fits thumbnail nodes into an SVG viewBox. The span comes from node centres
 * (at least THUMB_MIN_SPAN), radii are capped to THUMB_MAX_RADIUS of it, and
 * the box never shrinks below the span, so one node cannot fill the card.
 */
export function thumbFrame(nodes: readonly Pick<ThumbnailNode, "x" | "y" | "radius">[]): ThumbFrame {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  if (!nodes.length) {
    minX = minY = maxX = maxY = 0;
  }
  const span = Math.max(maxX - minX, maxY - minY, THUMB_MIN_SPAN);
  const cap = span * THUMB_MAX_RADIUS;
  const radii = nodes.map((node) => Math.min(node.radius || 48, cap));
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  nodes.forEach((node, index) => {
    const r = radii[index]!;
    left = Math.min(left, node.x - r);
    top = Math.min(top, node.y - r);
    right = Math.max(right, node.x + r);
    bottom = Math.max(bottom, node.y + r);
  });
  if (!nodes.length) {
    left = top = right = bottom = 0;
  }
  const weight = Math.max(right - left, bottom - top, 1) / 150;
  const width = Math.max(right - left + THUMB_PAD * 2, THUMB_MIN_SPAN);
  const height = Math.max(bottom - top + THUMB_PAD * 2, THUMB_MIN_SPAN);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  return { viewBox: [cx - width / 2, cy - height / 2, width, height], radii, weight };
}

/** Enter submits unless Shift is held, an IME is composing (229) or the key repeats. */
export function enterAction(event: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  repeat?: boolean;
}): "ignore" | "swallow" | "submit" {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return "ignore";
  return event.repeat ? "swallow" : "submit";
}
