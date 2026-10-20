// Pure layout of the observatory gallery: two gently curved rows
// (调研中 above, 已完成 below) that pan sideways together.

export const FOV = 38;
const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);

export interface GalleryParams {
  /** Camera distance from the gallery plane (z = 0). */
  camDist: number;
  /** Half the visible width / height at z = 0, in world units. */
  halfWidth: number;
  halfHeight: number;
  /** Distance between neighbouring galaxies. */
  spacing: number;
  /** World y of the 调研中 row (0) and the 已完成 row (1). */
  rowY: [number, number];
  /** z = -curve * x^2 bends the rows away from the camera. */
  curve: number;
  /** Space kept free at each side when the content overflows. */
  margin: number;
  /** Galaxy disc radius. */
  galaxyRadius: number;
  /** Shown when the viewport is narrow (phones). */
  compact: boolean;
}

/** Layout constants for a viewport aspect ratio (width / height). */
export function galleryParams(aspect: number): GalleryParams {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 10;
  const compact = safeAspect < 0.9;
  // Wide screens use a fixed distance; narrow ones back off until ~7 units fit.
  const wanted = compact ? 3.7 / (TAN_HALF * safeAspect) : 15;
  const camDist = Math.min(30, Math.max(15, wanted));
  const halfHeight = camDist * TAN_HALF;
  const halfWidth = halfHeight * safeAspect;
  const centre = halfHeight * (compact ? 0.1 : 0.13);
  const offset = Math.max(2.05, halfHeight * (compact ? 0.3 : 0.385));
  return {
    camDist,
    halfWidth,
    halfHeight,
    spacing: compact ? 3.9 : 3.85,
    rowY: [centre + offset, centre - offset],
    curve: compact ? 0.05 : 0.03,
    margin: compact ? 1.9 : 2.3,
    galaxyRadius: 1.25,
    compact,
  };
}

export interface ScrollBounds {
  min: number;
  max: number;
  /** Every row fits on screen: rows are centred and nothing pans. */
  fits: boolean;
}

/** Pan limits for the longest row. */
export function scrollBounds(maxLen: number, params: Pick<GalleryParams, "spacing" | "halfWidth" | "margin">): ScrollBounds {
  const content = Math.max(0, maxLen - 1) * params.spacing;
  const inner = Math.max(0, params.halfWidth - params.margin);
  if (content <= inner * 2) return { min: 0, max: 0, fits: true };
  // x = index * spacing - scroll: slot 0 sits at the left edge when scroll = inner.
  return { min: inner, max: content - inner, fits: false };
}

/**
 * World x of a slot before panning. Rows are centred when everything fits,
 * otherwise left-aligned so the newest study of each row starts at the left.
 */
export function slotX(index: number, rowLen: number, spacing: number, fits: boolean): number {
  return fits ? (index - (rowLen - 1) / 2) * spacing : index * spacing;
}

export interface SlotPose {
  x: number;
  y: number;
  z: number;
  /** Yaw that turns the galaxy toward the camera. */
  rotY: number;
}

/** Pose of a galaxy at panned x on a row. */
export function slotPose(x: number, row: 0 | 1, params: Pick<GalleryParams, "rowY" | "curve" | "camDist">): SlotPose {
  const z = -params.curve * x * x;
  return { x, y: params.rowY[row], z, rotY: 0.6 * Math.atan2(-x, params.camDist - z) };
}

/** Scroll that brings slot x into view (unchanged when it already is). */
export function scrollToReveal(scroll: number, x: number, params: Pick<GalleryParams, "halfWidth" | "margin">, bounds: ScrollBounds): number {
  if (bounds.fits) return 0;
  const inner = Math.max(0.5, params.halfWidth - params.margin);
  let next = scroll;
  if (x - next > inner) next = x - inner;
  if (x - next < -inner) next = x + inner;
  return Math.min(bounds.max, Math.max(bounds.min, next));
}

/** Rubber-band clamp: inside the bounds unchanged, outside it resists. */
export function rubberBand(value: number, min: number, max: number, give = 1.4): number {
  if (value < min) return min - give * (1 - Math.exp((value - min) / give));
  if (value > max) return max + give * (1 - Math.exp((max - value) / give));
  return value;
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * Keyboard neighbour in the two-row gallery. Left/Right move within a row
 * (and wrap into the other row at its ends), Up/Down jump to the nearest
 * slot of the other row.
 */
export function neighbour(
  rows: readonly [readonly string[], readonly string[]],
  id: string,
  key: ArrowKey,
  fits: boolean,
  spacing = 1,
): string | null {
  const found = rows[0].includes(id) ? 0 : rows[1].includes(id) ? 1 : -1;
  if (found < 0) return null;
  const row = found as 0 | 1;
  const list = rows[row];
  const index = list.indexOf(id);
  const other = rows[row === 0 ? 1 : 0]!;
  switch (key) {
    case "Home":
      return list[0] ?? null;
    case "End":
      return list[list.length - 1] ?? null;
    case "ArrowLeft":
      if (index > 0) return list[index - 1]!;
      return row === 1 && other.length ? other[other.length - 1]! : null;
    case "ArrowRight":
      if (index < list.length - 1) return list[index + 1]!;
      return row === 0 && other.length ? other[0]! : null;
    case "ArrowUp":
    case "ArrowDown": {
      if ((key === "ArrowUp" && row === 0) || (key === "ArrowDown" && row === 1) || !other.length) return null;
      const x = slotX(index, list.length, spacing, fits);
      let best = 0;
      let bestDistance = Infinity;
      other.forEach((_, otherIndex) => {
        const distance = Math.abs(slotX(otherIndex, other.length, spacing, fits) - x);
        if (distance < bestDistance - 1e-9) {
          best = otherIndex;
          bestDistance = distance;
        }
      });
      return other[best]!;
    }
  }
}
