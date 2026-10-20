// Colours from DESIGN.md section 3.

import type { Relation, Tone } from "../types/api";

export const SPACE = "#05060a";
export const ERROR_RED = "#ff5a6a";

export const TONE_COLOR: Record<Tone, string> = {
  origin: "#48d3e4",
  cyan: "#48d3e4",
  green: "#58d69a",
  violet: "#aa8cff",
  amber: "#f4c56a",
  blue: "#6d9cff",
  teal: "#7ddec8",
  pending: "#9eb0c2",
};

export function toneColor(tone: string | undefined): string {
  return (tone && TONE_COLOR[tone as Tone]) || TONE_COLOR.blue;
}

export const RELATION_COLOR: Record<Relation, string> = {
  parent: "#6d9cff",
  audit: "#48d3e4",
  fusion: "#48d3e4",
  support: "#f4c56a",
  challenge: "#aa8cff",
  error: ERROR_RED,
};
