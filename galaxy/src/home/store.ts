// Home-only state. High-frequency motion (pan, camera) lives in motion.ts,
// not here, so React never re-renders per frame.

import { create } from "zustand";
import type { HistoryRow, Thumbnail } from "../types/api";
import { mergeRows } from "./format";

export type Quality = "high" | "low";

export interface Flight {
  id: string;
  href: string;
}

export interface Launch {
  href: string;
  /** Launch button centre in client px: where the new star is born. */
  from: { x: number; y: number };
}

export interface HomeState {
  /** Studies in created_at desc order (deleted ones filtered out), null until the first load. */
  rows: HistoryRow[] | null;
  /** Shown when the history cannot be read and nothing is on screen yet. */
  loadError: string | null;
  /** Latest thumbnail per study id (replaced only when its signature changes). */
  thumbs: Record<string, Thumbnail>;
  hovered: string | null;
  focused: string | null;
  /** Ids playing the implode animation after a successful delete. */
  removing: Record<string, true>;
  /** Deleted ids kept out of the list until history stops returning them. */
  removed: Record<string, true>;
  /** Camera flight into a study, then navigation. */
  flight: Flight | null;
  /** New-star launch after a successful submit. */
  launch: Launch | null;
  /** Study whose delete dialog is open, with the control that opened it. */
  deleteTarget: { row: HistoryRow; opener: HTMLElement | null } | null;
  reducedMotion: boolean;
  quality: Quality;
  /** True once the WebGL scene has mounted and can play launches/flights. */
  sceneReady: boolean;

  applyHistory(rows: HistoryRow[]): void;
  setLoadError(message: string | null): void;
  setThumb(id: string, thumb: Thumbnail): void;
  hover(id: string | null): void;
  focus(id: string | null): void;
  fly(flight: Flight): void;
  startLaunch(launch: Launch): void;
  /** Clears flight/launch (bfcache restore). */
  resetMotion(): void;
  openDelete(row: HistoryRow, opener: HTMLElement | null): void;
  closeDelete(): void;
  /** DELETE succeeded: play the implode (or drop at once when there is no scene). */
  beginRemove(id: string): void;
  finishRemove(id: string): void;
  setReducedMotion(value: boolean): void;
  setQuality(value: Quality): void;
  setSceneReady(value: boolean): void;
}

let rawRows: HistoryRow[] | null = null;

/** Rows without deleted ids, except those still imploding (`keep`). */
function visibleRows(rows: HistoryRow[] | null, removed: Record<string, true>, keep: Record<string, true> = {}): HistoryRow[] | null {
  if (!rows) return null;
  const kept = rows.filter((row) => !removed[row.id] || keep[row.id]);
  return kept.length === rows.length ? rows : kept;
}

export const useHome = create<HomeState>()((set, get) => ({
  rows: null,
  loadError: null,
  thumbs: {},
  hovered: null,
  focused: null,
  removing: {},
  removed: {},
  flight: null,
  launch: null,
  deleteTarget: null,
  reducedMotion: false,
  quality: "high",
  sceneReady: false,

  applyHistory(next) {
    rawRows = mergeRows(rawRows, next);
    const ids = new Set(rawRows.map((row) => row.id));
    const state = get();
    // Forget removed ids the server no longer returns (a real delete);
    // a mocked delete keeps them hidden for the session.
    let removed = state.removed;
    for (const id of Object.keys(removed)) {
      if (!ids.has(id) && !state.removing[id]) {
        if (removed === state.removed) removed = { ...removed };
        delete removed[id];
      }
    }
    const merged = mergeRows(state.rows, visibleRows(rawRows, removed, state.removing) ?? []);
    set({ rows: merged, removed, loadError: null });
  },
  setLoadError(message) {
    set({ loadError: message });
  },
  setThumb(id, thumb) {
    set((state) => ({ thumbs: { ...state.thumbs, [id]: thumb } }));
  },
  hover(id) {
    if (get().hovered !== id) set({ hovered: id });
  },
  focus(id) {
    if (get().focused !== id) set({ focused: id });
  },
  fly(flight) {
    if (get().flight || get().launch) return;
    set({ flight });
  },
  startLaunch(launch) {
    if (get().launch) return;
    set({ launch, hovered: null });
  },
  resetMotion() {
    set({ flight: null, launch: null });
  },
  openDelete(row, opener) {
    set({ deleteTarget: { row, opener } });
  },
  closeDelete() {
    set({ deleteTarget: null });
  },
  beginRemove(id) {
    const state = get();
    const removed = { ...state.removed, [id]: true as const };
    if (!state.sceneReady || state.reducedMotion) {
      set({ removed, rows: visibleRows(state.rows, removed), hovered: null, focused: state.focused === id ? null : state.focused });
      return;
    }
    set({ removed, removing: { ...state.removing, [id]: true }, hovered: state.hovered === id ? null : state.hovered });
  },
  finishRemove(id) {
    const state = get();
    if (!state.removing[id]) return;
    const removing = { ...state.removing };
    delete removing[id];
    set({
      removing,
      rows: visibleRows(state.rows, state.removed),
      focused: state.focused === id ? null : state.focused,
    });
  },
  setReducedMotion(value) {
    set({ reducedMotion: value });
  },
  setQuality(value) {
    if (get().quality !== value) set({ quality: value });
  },
  setSceneReady(value) {
    set({ sceneReady: value });
  },
}));
