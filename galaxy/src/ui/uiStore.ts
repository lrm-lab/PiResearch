// UI-only state for the HUD (menus, legend, report dialog). App data lives in src/store.ts.

import { create } from "zustand";
import { useGalaxy } from "../store";

/**
 * Report dialog over the study page (the galaxy keeps running behind it):
 * closed → open (short scale/fade in) → leaving (fade out) → closed.
 */
export type ReportStage = "closed" | "open" | "leaving";
export type MenuId = "quality" | "more" | "help" | null;

export const REPORT_BUTTON_ID = "galaxy-report-button";

interface UiState {
  legendOpen: boolean;
  menu: MenuId;
  sheetExpanded: boolean;
  reportStage: ReportStage;
  /** The "研究已完成 · 阅读报告" prompt was dismissed or acted on (per study, this session). */
  reportCtaDismissed: boolean;
  setLegendOpen(open: boolean): void;
  setMenu(menu: MenuId): void;
  toggleMenu(menu: Exclude<MenuId, null>): void;
  setSheetExpanded(expanded: boolean): void;
  /** Clear the selection, collapse the sheet and return focus to the node's label (`id` defaults to the selection). */
  closeDetail(id?: string): void;
  /** Open the report dialog (no-op unless closed). */
  beginReport(): void;
  /** Start closing; the reader calls `reportClosed` when its exit finishes. */
  endReport(): void;
  reportClosed(): void;
  /** Hide the report prompt for this study. */
  dismissReportCta(): void;
  /** Re-read the prompt's dismissed flag for a study (on study change). */
  syncReportCta(studyId: string | null): void;
}

const CTA_KEY = "galaxy-report-cta:";

function ctaDismissed(studyId: string | null): boolean {
  if (!studyId) return false;
  try {
    return sessionStorage.getItem(CTA_KEY + studyId) === "1";
  } catch {
    return false;
  }
}

function rememberCtaDismissed(studyId: string | null) {
  if (!studyId) return;
  try {
    sessionStorage.setItem(CTA_KEY + studyId, "1");
  } catch {
    // Private mode: the prompt just comes back on reload.
  }
}

function initialLegend(): boolean {
  return typeof window === "undefined" || window.innerWidth > 600;
}

export const useUi = create<UiState>()((set, get) => ({
  legendOpen: initialLegend(),
  menu: null,
  sheetExpanded: false,
  reportStage: "closed",
  reportCtaDismissed: false,

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
  closeDetail(id) {
    const galaxy = useGalaxy.getState();
    const target = id ?? galaxy.selectedId;
    galaxy.select(null);
    get().setSheetExpanded(false);
    focusNodeLabel(target);
  },

  beginReport() {
    if (get().reportStage !== "closed") return;
    rememberCtaDismissed(useGalaxy.getState().studyId);
    set({ reportStage: "open", menu: null, reportCtaDismissed: true });
  },

  endReport() {
    if (get().reportStage !== "open") return;
    set({ reportStage: "leaving" });
  },

  reportClosed() {
    if (get().reportStage !== "leaving") return;
    set({ reportStage: "closed" });
    focusReportButton();
  },

  dismissReportCta() {
    rememberCtaDismissed(useGalaxy.getState().studyId);
    set({ reportCtaDismissed: true });
  },

  syncReportCta(studyId) {
    const dismissed = ctaDismissed(studyId);
    if (get().reportCtaDismissed !== dismissed) set({ reportCtaDismissed: dismissed });
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
