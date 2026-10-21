// Mutable per-frame state shared by the DOM layer and the scene. Kept out of
// React/zustand on purpose: it changes every frame.

import { galleryParams, scrollBounds, type GalleryParams, type ScrollBounds } from "./layout";

export interface GalleryMotion {
  /** Rendered pan (world x). */
  scroll: number;
  /** Where the pan is heading. */
  target: number;
  /** Inertia after a drag, world units per second. */
  velocity: number;
  dragging: boolean;
  /** The last pointer gesture moved far enough to count as a drag (cancels the click). */
  dragged: boolean;
  params: GalleryParams;
  bounds: ScrollBounds;
  /** Viewport size in CSS px. */
  width: number;
  height: number;
  /** Pointer in [-1, 1] for the camera sway. */
  pointer: { x: number; y: number };
  /** One-shot: the launch reserves slot 0 of the 调研中 row. */
  launchSlot: boolean;
  /** CSS px kept free above the bottom edge for the composer (captions stay above it). */
  composerReserve: number;
}

export const gallery: GalleryMotion = {
  scroll: 0,
  target: 0,
  velocity: 0,
  dragging: false,
  dragged: false,
  params: galleryParams(16 / 10),
  bounds: { min: 0, max: 0, fits: true },
  width: 1440,
  height: 900,
  pointer: { x: 0, y: 0 },
  launchSlot: false,
  composerReserve: 0,
};

/** Recompute layout constants for a viewport / row count. */
export function updateGalleryLayout(width: number, height: number, maxLen: number): void {
  gallery.width = width;
  gallery.height = height;
  gallery.params = galleryParams(width / Math.max(1, height));
  const wasFits = gallery.bounds.fits;
  gallery.bounds = scrollBounds(maxLen, gallery.params);
  if (gallery.bounds.fits) {
    gallery.target = 0;
  } else if (wasFits) {
    gallery.target = gallery.bounds.min;
    gallery.scroll = gallery.bounds.min;
  } else {
    gallery.target = Math.min(gallery.bounds.max, Math.max(gallery.bounds.min, gallery.target));
  }
}

/** DOM elements the scene positions every frame. */
export const captionEls = new Map<string, HTMLElement>();
export const rowLabelEls: [HTMLElement | null, HTMLElement | null] = [null, null];
export const emptyEls: [HTMLElement | null, HTMLElement | null] = [null, null];

/** Untransformed caption sizes in CSS px, kept current by a ResizeObserver (no per-frame layout reads). */
export const captionSizes = new Map<string, { width: number; height: number }>();
let sizeObserver: ResizeObserver | null = null;

function observeSize(element: HTMLElement): void {
  if (typeof ResizeObserver === "undefined") return;
  sizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.study;
      const box = entry.borderBoxSize?.[0];
      if (id) captionSizes.set(id, { width: box?.inlineSize ?? entry.contentRect.width, height: box?.blockSize ?? entry.contentRect.height });
    }
  });
  sizeObserver.observe(element);
}

export function registerCaption(id: string, element: HTMLElement | null): void {
  const previous = captionEls.get(id);
  if (previous && previous !== element) sizeObserver?.unobserve(previous);
  if (element) {
    captionEls.set(id, element);
    observeSize(element);
  } else {
    captionEls.delete(id);
    captionSizes.delete(id);
  }
}
