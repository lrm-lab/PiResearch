// Mutable per-frame state shared by the DOM layer and the scene. Kept out of
// React/zustand on purpose: it changes every frame.

import {
  HEADER_PX,
  captionWidth,
  galleryParams,
  gridLayout,
  pxPerUnit,
  scrollBounds,
  viewBand,
  type Band,
  type GalleryParams,
  type GridLayout,
  type ScrollBounds,
} from "./layout";

export interface GalleryMotion {
  /** Rendered vertical scroll (world units; larger raises the content). */
  scroll: number;
  /** Where the scroll is heading. */
  target: number;
  /** Inertia after a drag, world units per second. */
  velocity: number;
  dragging: boolean;
  /** The last pointer gesture moved far enough to count as a drag (cancels the click). */
  dragged: boolean;
  params: GalleryParams;
  /** Section lines and slots for the current viewport and row counts. */
  layout: GridLayout;
  /** Free band between header and composer (kept current every frame). */
  band: Band;
  bounds: ScrollBounds;
  /** Viewport size in CSS px, and CSS px per world unit at z = 0. */
  width: number;
  height: number;
  ppu: number;
  /** Pointer in [-1, 1] for the camera sway. */
  pointer: { x: number; y: number };
  /** One-shot: the launch reserves slot 0 of the 调研中 section. */
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
  layout: gridLayout([0, 0], galleryParams(16 / 10), 87),
  band: { top: 4, bottom: -4 },
  bounds: { min: 0, max: 0, fits: true, top: 0 },
  width: 1440,
  height: 900,
  ppu: 87,
  pointer: { x: 0, y: 0 },
  launchSlot: false,
  composerReserve: 0,
};

/**
 * Recompute the layout for a viewport and the section sizes (调研中 including
 * a reserved launch slot, 已完成). Also publishes the caption width as
 * --home-cap-w so neighbouring captions never overlap.
 */
export function updateGalleryLayout(width: number, height: number, counts: readonly [number, number]): void {
  gallery.width = width;
  gallery.height = height;
  gallery.params = galleryParams(width / Math.max(1, height));
  gallery.ppu = pxPerUnit(gallery.params, height);
  gallery.layout = gridLayout(counts, gallery.params, gallery.ppu);
  updateGalleryBounds();
  gallery.target = Math.min(gallery.bounds.max, Math.max(gallery.bounds.min, gallery.target));
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--home-cap-w", `${captionWidth(gallery.params, gallery.ppu)}px`);
  }
}

/** Band and scroll limits (cheap; run every frame since the composer can grow). */
export function updateGalleryBounds(): void {
  gallery.band = viewBand(gallery.params, gallery.height, gallery.composerReserve);
  gallery.bounds = scrollBounds(gallery.layout, gallery.band);
  if (gallery.bounds.fits) gallery.target = 0;
}

/**
 * Opacity for DOM placed at screen y `top`..`bottom` (CSS px): 1 inside the
 * free band, fading to 0 within `fade` px past the header or the composer.
 */
export function bandOpacity(top: number, bottom: number, fade = 26): number {
  const enter = Math.min(1, Math.max(0, (top - (HEADER_PX - fade)) / fade));
  const leave = Math.min(1, Math.max(0, (gallery.height - gallery.composerReserve + fade - bottom) / fade));
  return enter * leave;
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
