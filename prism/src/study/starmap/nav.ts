// Arrow-key navigation across the star map: move to the nearest star in the pressed direction.

import type { Point } from "./transform";

export type Dir = "left" | "right" | "up" | "down";

const VECTOR: Record<Dir, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export function dirOfKey(key: string): Dir | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

/**
 * The star to move to from `fromId`: inside a 100° cone around the direction, scored by distance with
 * a penalty for being off-axis. Falls back to anything lying in that half-plane. `null` if nothing
 * lies that way. With no current star, the first of `points` (the goal comes first).
 */
export function nextInDirection(points: readonly (Point & { id: string })[], fromId: string | null, dir: Dir): string | null {
  if (!points.length) return null;
  const from = points.find((p) => p.id === fromId);
  if (!from) return points[0]!.id;
  const v = VECTOR[dir];
  let best: { id: string; score: number } | null = null;
  let fallback: { id: string; score: number } | null = null;
  for (const p of points) {
    if (p.id === from.id) continue;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const along = (dx * v.x + dy * v.y) / dist;
    if (along <= 0.05) continue;
    const score = dist * (1 + (1 - along) * 3);
    if (along >= Math.cos((50 * Math.PI) / 180)) {
      if (!best || score < best.score) best = { id: p.id, score };
    } else if (!fallback || score < fallback.score) fallback = { id: p.id, score };
  }
  return (best ?? fallback)?.id ?? null;
}
