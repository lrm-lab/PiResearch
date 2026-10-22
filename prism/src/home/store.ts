// Home-only state. Per-frame motion (mini orbits, slab bobbing) reads this store from inside
// useFrame with getState(), so React never re-renders per frame.

import { create } from "zustand";
import type { HistoryRow, Thumbnail } from "../types/api";
import { mergeRows } from "./format";

/** A submitted question on its way into the grid (the ghost card and its reserved slot). */
export interface Pending {
  question: string;
  href: string;
  /** `crystal`: the ghost forms over the composer; `fly`: it has moved into the first grid slot. */
  phase: "crystal" | "fly";
}

export interface HomeState {
  /** Studies in created_at desc order (deleted ones filtered out), null until the first load. */
  rows: HistoryRow[] | null;
  /** Shown when the history cannot be read and nothing is on screen yet. */
  loadError: string | null;
  /** Latest thumbnail per study id (replaced only when its signature changes). */
  thumbs: Record<string, Thumbnail>;
  /** Card under the pointer or holding keyboard focus: its mini orbits. */
  hovered: string | null;
  /** Deleted ids kept out of the list until history stops returning them. */
  removed: Record<string, true>;
  /** Study whose delete dialog is open, with the control that opened it. */
  deleteTarget: { row: HistoryRow; opener: HTMLElement | null } | null;
  pending: Pending | null;
  /** Text an example chip asks the composer to take (consumed by the composer). */
  prefill: string | null;

  applyHistory(rows: HistoryRow[]): void;
  setLoadError(message: string | null): void;
  setThumb(id: string, thumb: Thumbnail): void;
  hover(id: string | null): void;
  /** Clear the hover only if `id` still holds it. */
  unhover(id: string): void;
  openDelete(row: HistoryRow, opener: HTMLElement | null): void;
  closeDelete(): void;
  /** DELETE succeeded: drop the row now (the grid plays the dissolve as an exit animation). */
  remove(id: string): void;
  setPending(pending: Pending | null): void;
  setPrefill(text: string | null): void;
}

let rawRows: HistoryRow[] | null = null;

/** Rows without deleted ids. */
function visibleRows(rows: HistoryRow[] | null, removed: Record<string, true>): HistoryRow[] | null {
  if (!rows) return null;
  const kept = rows.filter((row) => !removed[row.id]);
  return kept.length === rows.length ? rows : kept;
}

export const useHome = create<HomeState>()((set, get) => ({
  rows: null,
  loadError: null,
  thumbs: {},
  hovered: null,
  removed: {},
  deleteTarget: null,
  pending: null,
  prefill: null,

  applyHistory(next) {
    rawRows = mergeRows(rawRows, next);
    const ids = new Set(rawRows.map((row) => row.id));
    const state = get();
    // Forget removed ids the server no longer returns (a real delete);
    // a mocked delete keeps them hidden for the session.
    let removed = state.removed;
    for (const id of Object.keys(removed)) {
      if (!ids.has(id)) {
        if (removed === state.removed) removed = { ...removed };
        delete removed[id];
      }
    }
    const merged = mergeRows(state.rows, visibleRows(rawRows, removed) ?? []);
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
  unhover(id) {
    if (get().hovered === id) set({ hovered: null });
  },
  openDelete(row, opener) {
    set({ deleteTarget: { row, opener } });
  },
  closeDelete() {
    set({ deleteTarget: null });
  },
  remove(id) {
    const state = get();
    const removed = { ...state.removed, [id]: true as const };
    set({ removed, rows: visibleRows(state.rows, removed), hovered: state.hovered === id ? null : state.hovered });
  },
  setPending(pending) {
    set({ pending });
  },
  setPrefill(prefill) {
    set({ prefill });
  },
}));

/** Test hook: forget the module-level raw rows between cases. */
export function resetHomeStore(): void {
  rawRows = null;
  useHome.setState({ rows: null, loadError: null, thumbs: {}, hovered: null, removed: {}, deleteTarget: null, pending: null, prefill: null });
}
