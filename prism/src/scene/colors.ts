// Colour helpers for the scene. Every input colour comes from lib/palette.ts or lib/status.ts;
// this module only mixes them. Pure: no three.js.

import { BRAND, LAVENDER, RELATION_HEX, STATUS_HEX, SURFACE, type SceneSurface } from "../lib/palette";
import { taskTone, TONE_HEX, type TaskTone } from "../lib/status";
import type { Theme } from "../lib/theme";
import type { NodeStatus, Relation } from "../types/api";

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear mix in sRGB space, t clamped to 0…1. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
}

/** CSS rgba() for canvas drawing. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/** Everything a card face and edge needs, per status and theme. */
export interface CardLook {
  tone: TaskTone;
  /** Status ring / semantic colour. */
  ring: string;
  /** Face background. */
  face: string;
  /** Face background alpha (open tasks are ghosts). */
  faceAlpha: number;
  title: string;
  muted: string;
  /** Face border (solid) or dashed outline for ghosts. */
  border: string;
  dashed: boolean;
  /** State label colour. */
  label: string;
  /** Slab side colour and opacity. */
  slab: string;
  slabOpacity: number;
}

export function cardLook(status: NodeStatus | string | undefined, erroneous: boolean, theme: Theme): CardLook {
  const s: SceneSurface = SURFACE[theme];
  const tone = taskTone(status, erroneous);
  const ring = TONE_HEX[tone];
  const ghost = tone === "todo" && status !== "in_progress";
  const closed = tone === "closed";
  return {
    tone,
    ring,
    face: closed ? mixHex(s.card, s.cardEdge, theme === "light" ? 0.45 : 0.6) : s.card,
    faceAlpha: ghost ? (theme === "light" ? 0.55 : 0.5) : 1,
    title: closed ? s.muted : s.ink,
    muted: s.muted,
    border: ghost ? mixHex(s.cardEdge, s.muted, 0.55) : s.cardEdge,
    dashed: ghost,
    label: tone === "error" ? STATUS_HEX.error : s.muted,
    slab: closed ? mixHex(s.card, s.cardEdge, 0.6) : theme === "light" ? mixHex(s.card, s.cardEdge, 0.8) : s.card,
    slabOpacity: ghost ? 0.28 : 1,
  };
}

/** Relation ribbon colour (fusion drawn as audit). */
export function relationColor(relation: Relation): string {
  return RELATION_HEX[relation] ?? RELATION_HEX.parent;
}

/** Brand violet is for selection only. */
export const SELECT_HEX = BRAND[600];
/** Border beam on in-progress cards: blue → lavender. */
export const BEAM_FROM = STATUS_HEX.progress;
export const BEAM_TO = LAVENDER;
/** Prism glass tint and environment. */
export const GLASS_TINT = SURFACE.light.card;
export const GLASS_ATTENUATION = LAVENDER;
