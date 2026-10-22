// Colours for code that cannot read CSS variables (three.js materials, canvas). Every value mirrors
// a token in styles/tokens.css; the UI itself uses the Tailwind utilities, never these.

import type { Relation, Tone } from "../types/api";
import type { Theme } from "./theme";

/** CoForge avatar placeholder tones (`--color-agent-1…6`). */
export const AGENT_TONES = ["#7556b9", "#d18a38", "#b65757", "#5268b7", "#497665", "#ba5937"] as const;

/** The API's per-agent tone key → one of the six avatar tones. `origin` is the goal (brand). */
const TONE_INDEX: Record<Exclude<Tone, "origin" | "pending">, number> = {
  violet: 0,
  amber: 1,
  teal: 2,
  blue: 3,
  green: 4,
  cyan: 5,
};

export const BRAND = { 50: "#f8f5ff", 100: "#efe8ff", 200: "#ded1ff", 300: "#c9b3ff", 400: "#a993ff", 500: "#8f6ff2", 600: "#5d36dc", 700: "#4c2ab8", 800: "#3d2295", 900: "#332073", 950: "#21134d" } as const;
export const LAVENDER = "#c5bafe";
export const PRISM_GROUND = "#0a0912";

/** Agent tone hex for an API tone key. Pending (no agent) is the offline grey. */
export function agentTone(tone: Tone | string | undefined): string {
  if (tone === "origin") return BRAND[600];
  const index = TONE_INDEX[tone as keyof typeof TONE_INDEX];
  return index === undefined ? "#afbccb" : AGENT_TONES[index]!;
}

/** Index 1…6 of the avatar tone (for `bg-[var(--color-agent-N)]`), 0 for pending/goal. */
export function agentToneIndex(tone: Tone | string | undefined): number {
  const index = TONE_INDEX[tone as keyof typeof TONE_INDEX];
  return index === undefined ? 0 : index + 1;
}

/** Task-status hexes (Tailwind v4 palette steps used by CoForge's TASK_STATUS_COLOR). */
export const STATUS_HEX = {
  todo: "#ff6900", // orange-500
  progress: "#2b7fff", // blue-500
  review: "#615fff", // indigo-500
  done: "#00c950", // green-500
  closed: "#a1a1a1", // neutral-400
  error: "#fb2c36", // red-500
} as const;

/** Relation line colours: neutral structure, semantic verification. Brand stays for selection. */
export const RELATION_HEX: Record<Relation, string> = {
  parent: "#afbccb",
  audit: STATUS_HEX.review,
  fusion: STATUS_HEX.review,
  support: STATUS_HEX.done,
  challenge: STATUS_HEX.todo,
  error: STATUS_HEX.error,
};

/** Surfaces the 3D scene paints, per theme (bg-primary, border-secondary, text-primary …). */
export interface SceneSurface {
  ground: string;
  groundTint: string;
  card: string;
  cardEdge: string;
  ink: string;
  muted: string;
  grid: string;
  terminal: string;
}

export const SURFACE: Record<Theme, SceneSurface> = {
  light: {
    ground: "#ffffff",
    groundTint: "#f3f1ff",
    card: "#ffffff",
    cardEdge: "#e0e5f1",
    ink: "#101319",
    muted: "#777d8d",
    grid: "#e0e5f1",
    terminal: "#171b23",
  },
  dark: {
    ground: "#0a0a0a",
    groundTint: "#21183b",
    card: "#171717",
    cardEdge: "#262626",
    ink: "#fafafa",
    muted: "#a4a9b8",
    grid: "#262626",
    terminal: "#171b23",
  },
};
