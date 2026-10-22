// Chrome-only UI state (popovers, bottom sheet). The scene never reads this; shared study state
// lives in store.ts.

import { create } from "zustand";

export type StudyPopover = "help" | "legend" | null;
export type SheetSize = "peek" | "full";

/** Desktop slideout width (DESIGN.md §4), also the scene's `rightInset` while it is open. */
export const PANEL_WIDTH = 400;
/** Tailwind `lg`: side panel at and above, bottom sheet below. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

interface UiState {
  popover: StudyPopover;
  sheet: SheetSize;
  setPopover(popover: StudyPopover): void;
  togglePopover(popover: Exclude<StudyPopover, null>): void;
  setSheet(sheet: SheetSize): void;
}

export const useStudyUi = create<UiState>()((set, get) => ({
  popover: null,
  sheet: "peek",
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
