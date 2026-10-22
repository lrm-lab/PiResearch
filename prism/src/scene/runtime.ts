// Per-scene mutable state shared by the scene components inside one frame loop (no React state,
// no three.js): the motion schedule (intro, drops, flips), each card's current height so stacks,
// chips and shadows follow it, and the ripple queue. Times are seconds on `clock()`.

export function clock(): number {
  return performance.now() / 1000;
}

/** Far in the past: "already happened" (reduced motion, instant transitions). */
export const PAST = -1e6;

export interface CardMotion {
  /** Card bottom above the desk (world), with drop, float, hover and flip. */
  y: number;
  /** Stack compression 0 (full) … 1 (sunk, hidden agent). */
  sink: number;
  /** 0…1 visibility (dims, hidden agents). */
  opacity: number;
  /** The card is on stage (its drop started). */
  shown: boolean;
  /** When the card landed, or Infinity. */
  landedAt: number;
}

export interface Ripple {
  x: number;
  z: number;
  color: string;
  size: number;
  at: number;
}

export class SceneRuntime {
  time = clock();
  /** When the intro started (Infinity before the first snapshot is ready). */
  introAt = Infinity;
  /** Bumps on every new intro (study change) so the camera can replay it. */
  introSeq = 0;
  /** When each task's drop starts. */
  dropAt = new Map<string, number>();
  /** Last status change per task (the card flips). */
  flipAt = new Map<string, number>();
  motion = new Map<string, CardMotion>();
  /** When the prism fades in; the spectrum rays follow. */
  prismAt = Infinity;
  /** Endpoints of verification relations (what the lens keeps lit). */
  verification = new Set<string>();
  /** Tasks hidden by the agent filter (kept current by the scene root each frame). */
  hidden = new Set<string>();
  /** Eased goal activity (planning / finalising pulse) and its target. */
  activity = 0;
  activityTarget = 0;
  ripples: Ripple[] = [];

  reset(): void {
    this.introAt = Infinity;
    this.prismAt = Infinity;
    this.dropAt.clear();
    this.flipAt.clear();
    this.motion.clear();
    this.ripples.length = 0;
  }

  /** Goal "drop" time: relations from the goal draw after the intro starts. */
  dropTime(id: string, goalId: string | null): number {
    if (id === goalId) return this.introAt + 0.2;
    return this.dropAt.get(id) ?? Infinity;
  }

  spawnRipple(x: number, z: number, color: string, size: number): void {
    this.ripples.push({ x, z, color, size, at: this.time });
    if (this.ripples.length > 24) this.ripples.shift();
  }
}
