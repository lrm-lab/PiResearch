// Chrome-only UI state (popovers, bottom sheet, map camera requests). Shared study state lives in store.ts.

import { create } from "zustand";

export type StudyPopover = "help" | "legend" | null;
export type SheetSize = "peek" | "full";

/** Desktop slideout width (DESIGN.md §4); the star map keeps selected stars clear of it. */
export const PANEL_WIDTH = 400;
/** Tailwind `lg`: side panel at and above, bottom sheet below. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

interface UiState {
  popover: StudyPopover;
  sheet: SheetSize;
  /** Bumped by the F key and the fit button; the star map reacts to each new value. */
  fitRequest: number;
  /** Zoom button presses (`n` is bumped per press). */
  zoomRequest: { n: number; factor: number };
  /** Agent whose stars stay lit while the roster chip is hovered. */
  focusAgent: string | null;
  requestFit(): void;
  requestZoom(factor: number): void;
  setFocusAgent(agent: string | null): void;
  setPopover(popover: StudyPopover): void;
  togglePopover(popover: Exclude<StudyPopover, null>): void;
  setSheet(sheet: SheetSize): void;
}

export const useStudyUi = create<UiState>()((set, get) => ({
  popover: null,
  sheet: "peek",
  fitRequest: 0,
  zoomRequest: { n: 0, factor: 1 },
  focusAgent: null,
  requestFit() {
    set({ fitRequest: get().fitRequest + 1 });
  },
  requestZoom(factor) {
    set({ zoomRequest: { n: get().zoomRequest.n + 1, factor } });
  },
  setFocusAgent(agent) {
    if (get().focusAgent !== agent) set({ focusAgent: agent });
  },
  setPopover(popover) {
    if (get().popover !== popover) set({ popover });
  },
  togglePopover(popover) {
    set({ popover: get().popover === popover ? null : popover });
  },
  setSheet(sheet) {
    if (get().sheet !== sheet) set({ sheet });
  },
}));
