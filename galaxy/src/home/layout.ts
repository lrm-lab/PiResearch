// Pure layout of the observatory gallery: two sections (调研中, then 已完成),
// each flowing into as many centred lines as it needs at a comfortable column
// spacing. The gallery scrolls vertically; the camera stays put and the
// galaxies move (y = contentTop + slot.y + scroll).

export const FOV = 38;
const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);

/** Vertical rhythm in CSS px (converted with the viewport's px per world unit). */
export const HEADER_PX = 72;
const HEADING_PX = 44;
const CAPTION_PX = 96;
const LINE_GAP_PX = 30;
const SECTION_GAP_PX = 30;
const EMPTY_PX = 70;
/** Room below the last line for a hovered/focused caption, which grows by ~40 px. */
export const EXPAND_PX = 44;
/** Widest caption, and the gap kept between neighbouring captions. */
export const CAPTION_MAX_PX = 264;
const CAPTION_GAP_PX = 18;

export interface GalleryParams {
  /** Camera distance from the gallery plane (z = 0). */
  camDist: number;
  /** Half the visible width / height at z = 0, in world units. */
  halfWidth: number;
  halfHeight: number;
  /** Distance between neighbouring columns. */
  spacing: number;
  /** z = -curve * x^2 bends each line away from the camera. */
  curve: number;
  /** Space kept free at each side, from the outermost galaxy centre to the edge. */
  edge: number;
  /** Galaxy disc radius. */
  galaxyRadius: number;
  /** Visible extent of a galaxy above its centre (tilted disc + bob). */
  above: number;
  /** Caption anchor below the galaxy centre (Galaxy.tsx places captions here). */
  captionDrop: number;
  /** Narrow viewport (phones). */
  compact: boolean;
}

/** Layout constants for a viewport aspect ratio (width / height). */
export function galleryParams(aspect: number): GalleryParams {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 10;
  const compact = safeAspect < 0.9;
  // Wide screens use a fixed distance; narrow ones back off until ~7.4 units fit.
  const wanted = compact ? 3.7 / (TAN_HALF * safeAspect) : 15;
  const camDist = Math.min(30, Math.max(15, wanted));
  const halfHeight = camDist * TAN_HALF;
  const halfWidth = halfHeight * safeAspect;
  const galaxyRadius = 1.25;
  return {
    camDist,
    halfWidth,
    halfHeight,
    spacing: compact ? 3.9 : 3.45,
    curve: compact ? 0.05 : 0.025,
    edge: 1.55,
    galaxyRadius,
    above: 1.12,
    captionDrop: galaxyRadius * 0.98,
    compact,
  };
}

/** CSS px per world unit at z = 0 for a viewport height. */
export function pxPerUnit(params: Pick<GalleryParams, "halfHeight">, heightPx: number): number {
  return Math.max(1, heightPx) / (2 * params.halfHeight);
}

/** How many galaxies fit side by side (at least 1). */
export function columnCount(params: Pick<GalleryParams, "halfWidth" | "edge" | "spacing">): number {
  const usable = 2 * params.halfWidth - 2 * params.edge;
  return Math.max(1, Math.floor(usable / params.spacing + 1e-6) + 1);
}

/** Caption width that keeps neighbouring captions apart. */
export function captionWidth(params: Pick<GalleryParams, "spacing">, ppu: number): number {
  return Math.round(Math.max(120, Math.min(CAPTION_MAX_PX, params.spacing * ppu - CAPTION_GAP_PX)));
}

export interface Slot {
  /** World x (centred on the line). */
  x: number;
  /** World y offset from the content top (always negative). */
  y: number;
}

export interface GridLayout {
  cols: number;
  /** Slots of 调研中 (0) and 已完成 (1), in reading order. */
  slots: [Slot[], Slot[]];
  /** Top of each section heading, offset from the content top. */
  headingY: [number, number];
  /** Centre of each section's empty note (used when the section is empty). */
  emptyY: [number, number];
  /** Leftmost column centre (the headings align with it). */
  left: number;
  /** Content height in world units. */
  height: number;
  /** Extent of a slot below its centre (the caption bottom). */
  below: number;
}

/**
 * Lines of at most `cols` galaxies per section, each line centred. Vertical
 * sizes that are text (headings, captions, gaps) are given in CSS px and
 * converted with `ppu`, so captions never collide with the next line.
 */
export function gridLayout(counts: readonly [number, number], params: GalleryParams, ppu: number): GridLayout {
  const cols = columnCount(params);
  const px = (value: number) => value / Math.max(1, ppu);
  const below = params.captionDrop + px(CAPTION_PX);
  const slots: [Slot[], Slot[]] = [[], []];
  const headingY: [number, number] = [0, 0];
  const emptyY: [number, number] = [0, 0];
  let y = 0;
  for (const section of [0, 1] as const) {
    if (section === 1) y -= px(SECTION_GAP_PX);
    headingY[section] = y;
    y -= px(HEADING_PX);
    const count = Math.max(0, Math.floor(counts[section]));
    if (count === 0) {
      emptyY[section] = y - px(EMPTY_PX) / 2;
      y -= px(EMPTY_PX);
      continue;
    }
    emptyY[section] = y - px(EMPTY_PX) / 2;
    for (let start = 0; start < count; start += cols) {
      const lineLen = Math.min(cols, count - start);
      const centre = y - params.above;
      for (let k = 0; k < lineLen; k += 1) {
        slots[section].push({ x: (k - (lineLen - 1) / 2) * params.spacing, y: centre });
      }
      y = centre - below - px(LINE_GAP_PX);
    }
    y += px(LINE_GAP_PX);
  }
  y -= px(EXPAND_PX);
  return { cols, slots, headingY, emptyY, left: (-(cols - 1) / 2) * params.spacing, height: -y, below };
}

export interface Band {
  /** World y of the top / bottom of the free area (below the header, above the composer). */
  top: number;
  bottom: number;
}

/** The free vertical band between the fixed header and the composer. */
export function viewBand(params: Pick<GalleryParams, "halfHeight">, heightPx: number, composerPx: number, headerPx = HEADER_PX): Band {
  const ppu = pxPerUnit(params, heightPx);
  const top = params.halfHeight - headerPx / ppu;
  const bottom = Math.min(top - 1, -params.halfHeight + composerPx / ppu);
  return { top, bottom };
}

export interface ScrollBounds {
  min: number;
  max: number;
  /** Everything fits: the content is centred in the band and nothing scrolls. */
  fits: boolean;
  /** World y of the content top at scroll 0. */
  top: number;
}

/** Scroll limits (world units; scrolling down raises the content). */
export function scrollBounds(layout: Pick<GridLayout, "height">, band: Band): ScrollBounds {
  const room = band.top - band.bottom;
  if (layout.height <= room) return { min: 0, max: 0, fits: true, top: band.top - (room - layout.height) / 2 };
  return { min: 0, max: layout.height - room, fits: false, top: band.top };
}

/**
 * Scroll that brings a slot (galaxy top to caption bottom, plus `extra` world
 * units below for an expanded caption) into the band; unchanged when it already is.
 */
export function scrollToReveal(
  scroll: number,
  slotY: number,
  params: Pick<GalleryParams, "above">,
  layout: Pick<GridLayout, "below">,
  band: Band,
  bounds: ScrollBounds,
  extra = 0,
): number {
  if (bounds.fits) return 0;
  const y = bounds.top + slotY;
  let next = scroll;
  if (y + next + params.above > band.top) next = band.top - params.above - y;
  if (y + next - layout.below - extra < band.bottom) next = band.bottom + layout.below + extra - y;
  return Math.min(bounds.max, Math.max(bounds.min, next));
}

export interface SlotPose {
  x: number;
  y: number;
  z: number;
  /** Yaw that turns the galaxy toward the camera. */
  rotY: number;
}

/** Pose of a galaxy at world (x, y) on the gently curved gallery. */
export function slotPose(x: number, y: number, params: Pick<GalleryParams, "curve" | "camDist">): SlotPose {
  const z = -params.curve * x * x;
  return { x, y, z, rotY: 0.6 * Math.atan2(-x, params.camDist - z) };
}

export interface GalleryLine {
  section: 0 | 1;
  /** Ids with their x in column units (centred lines). */
  items: { id: string; x: number }[];
}

/** The two sections broken into centred lines of at most `cols`. */
export function galleryLines(sections: readonly [readonly string[], readonly string[]], cols: number): GalleryLine[] {
  const lines: GalleryLine[] = [];
  const width = Math.max(1, Math.floor(cols));
  for (const section of [0, 1] as const) {
    const ids = sections[section];
    for (let start = 0; start < ids.length; start += width) {
      const chunk = ids.slice(start, start + width);
      lines.push({ section, items: chunk.map((id, k) => ({ id, x: k - (chunk.length - 1) / 2 })) });
    }
  }
  return lines;
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * Keyboard neighbour in the wrapped gallery. Left/Right step through reading
 * order (across lines and sections), Up/Down jump to the nearest galaxy on
 * the line above/below, Home/End go to the first/last of the section.
 */
export function neighbour(lines: readonly GalleryLine[], id: string, key: ArrowKey): string | null {
  const lineIndex = lines.findIndex((line) => line.items.some((item) => item.id === id));
  if (lineIndex < 0) return null;
  const line = lines[lineIndex]!;
  const item = line.items.find((entry) => entry.id === id)!;
  const flat = lines.flatMap((entry) => entry.items.map((value) => value.id));
  const at = flat.indexOf(id);
  switch (key) {
    case "ArrowLeft":
      return at > 0 ? flat[at - 1]! : null;
    case "ArrowRight":
      return at < flat.length - 1 ? flat[at + 1]! : null;
    case "Home":
    case "End": {
      const own = lines.filter((entry) => entry.section === line.section).flatMap((entry) => entry.items);
      return (key === "Home" ? own[0]?.id : own[own.length - 1]?.id) ?? null;
    }
    case "ArrowUp":
    case "ArrowDown": {
      const target = lines[lineIndex + (key === "ArrowUp" ? -1 : 1)];
      if (!target) return null;
      let best = target.items[0]!;
      for (const candidate of target.items) {
        if (Math.abs(candidate.x - item.x) < Math.abs(best.x - item.x) - 1e-9) best = candidate;
      }
      return best.id;
    }
  }
}
