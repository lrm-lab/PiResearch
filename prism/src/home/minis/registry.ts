// The bridge between study cards (DOM) and the one shared mini-diorama canvas (lazy chunk).
// Cards register the element their mini should be drawn into; the canvas renders one drei `View`
// per entry, tracking that element. Nothing here imports three.js, so the home's main chunk stays
// light; the canvas installs the snapshot / invalidate hooks when it mounts.

import { useSyncExternalStore } from "react";

export interface MiniEntry {
  id: string;
  /** Stable ref object for drei's `View track` (its effect depends on the object identity). */
  track: { current: HTMLElement };
}

let entries: readonly MiniEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Draw study `id`'s mini into `element` until the returned function is called. */
export function registerMini(id: string, element: HTMLElement): () => void {
  const entry: MiniEntry = { id, track: { current: element } };
  entries = [...entries.filter((item) => item.id !== id), entry];
  emit();
  return () => {
    if (!entries.includes(entry)) return;
    entries = entries.filter((item) => item !== entry);
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMiniEntries(): readonly MiniEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
}

type Snapshotter = (element: HTMLElement) => HTMLCanvasElement | null;

let snapshotter: Snapshotter | null = null;
let invalidator: (() => void) | null = null;

/** Installed by the canvas while it is mounted. */
export function setMiniHooks(hooks: { snapshot: Snapshotter; invalidate: () => void } | null): void {
  snapshotter = hooks?.snapshot ?? null;
  invalidator = hooks?.invalidate ?? null;
}

/** A 2D copy of what the canvas currently draws over `element` (null without a canvas). */
export function snapshotMini(element: HTMLElement): HTMLCanvasElement | null {
  try {
    return snapshotter?.(element) ?? null;
  } catch {
    return null;
  }
}

/** Ask for a frame (scroll, layout changes) when the canvas renders on demand. */
export function invalidateMinis(): void {
  invalidator?.();
}
