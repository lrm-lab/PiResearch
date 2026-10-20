// UI-only state for the HUD (menus, legend, report landing). App data lives in src/store.ts.

import { create } from "zustand";
import { useGalaxy } from "../store";

/**
 * Report "landing": closed → diving (camera flies into the core, ~0.9 s)
 * → open (wash + paper) → leaving (paper sinks, wash fades) → closed.
 */
export type ReportStage = "closed" | "diving" | "open" | "leaving";
export type MenuId = "quality" | "more" | "help" | null;

export const DIVE_MS = 900;
export const REPORT_BUTTON_ID = "galaxy-report-button";

interface UiState {
  legendOpen: boolean;
  menu: MenuId;
  sheetExpanded: boolean;
  reportStage: ReportStage;
  setLegendOpen(open: boolean): void;
  setMenu(menu: MenuId): void;
  toggleMenu(menu: Exclude<MenuId, null>): void;
  setSheetExpanded(expanded: boolean): void;
  /** Start the landing sequence (no-op unless closed). */
  beginReport(): void;
  /** Reverse the landing; the reader calls `reportClosed` when its exit finishes. */
  endReport(): void;
  reportClosed(): void;
}

let diveTimer: ReturnType<typeof setTimeout> | null = null;

function initialLegend(): boolean {
  return typeof window === "undefined" || window.innerWidth > 600;
}

export const useUi = create<UiState>()((set, get) => ({
  legendOpen: initialLegend(),
  menu: null,
  sheetExpanded: false,
  reportStage: "closed",

  setLegendOpen(open) {
    set({ legendOpen: open });
  },
  setMenu(menu) {
    if (get().menu !== menu) set({ menu });
  },
  toggleMenu(menu) {
    set({ menu: get().menu === menu ? null : menu });
  },
  setSheetExpanded(expanded) {
    set({ sheetExpanded: expanded });
  },

  beginReport() {
    if (get().reportStage !== "closed") return;
    const galaxy = useGalaxy.getState();
    set({ reportStage: "diving", menu: null });
    galaxy.emitCamera({ kind: "core" });
    if (diveTimer) clearTimeout(diveTimer);
    diveTimer = setTimeout(
      () => {
        diveTimer = null;
        if (get().reportStage !== "diving") return;
        useGalaxy.getState().openReport();
        set({ reportStage: "open" });
      },
      galaxy.reducedMotion ? 0 : DIVE_MS,
    );
  },

  endReport() {
    const stage = get().reportStage;
    if (stage === "closed" || stage === "leaving") return;
    if (diveTimer) clearTimeout(diveTimer);
    diveTimer = null;
    const galaxy = useGalaxy.getState();
    galaxy.closeReport();
    galaxy.emitCamera({ kind: "overview" });
    set({ reportStage: stage === "diving" ? "closed" : "leaving" });
    if (stage === "diving") focusReportButton();
  },

  reportClosed() {
    if (get().reportStage !== "leaving") return;
    set({ reportStage: "closed" });
    focusReportButton();
  },
}));

function focusReportButton() {
  if (typeof document === "undefined") return;
  // After React drops `inert` from the HUD chrome.
  requestAnimationFrame(() => document.getElementById(REPORT_BUTTON_ID)?.focus({ preventScroll: true }));
}

/** Focus a node's label button in the scene (drei Html layer), if it is mounted. */
export function focusNodeLabel(id: string | null) {
  if (!id || typeof document === "undefined") return;
  const selector = `button[data-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}"]`;
  document.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
}
