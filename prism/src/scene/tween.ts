// Easing and smoothing for the scene's hand-rolled motion (no gsap / maath). Pure.

export const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** Overshoots a little (CoForge --ease-spring feel). */
export const easeOutBack = (t: number) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  if (!Number.isFinite(current)) return target;
  return target + (current - target) * Math.exp(-lambda * Math.min(dt, 0.1));
}

/**
 * Card drop: falls with gravity for `fall` seconds onto the rest height, then a small damped
 * bounce. Returns the height above the rest position (≥ 0) and whether it has landed.
 */
export function dropOffset(elapsed: number, height: number, fall = 0.42): { offset: number; landed: boolean } {
  if (elapsed <= 0) return { offset: height, landed: false };
  if (elapsed < fall) {
    const p = elapsed / fall;
    return { offset: height * (1 - p * p), landed: false };
  }
  const t = elapsed - fall;
  const bounce = Math.abs(Math.sin(t * 15)) * Math.exp(-t * 9) * height * 0.06;
  return { offset: bounce, landed: true };
}

/**
 * The status flip: 0 → π/2 (edge on, the face swaps), then −π/2 → 0. The jump through edge-on is
 * invisible, so it reads as one half turn revealing the new face. Returns the rotation, the lift
 * and whether the new face should show.
 */
export function flipPose(elapsed: number, duration = 0.7): { angle: number; lift: number; swapped: boolean; done: boolean } {
  const p = clamp01(elapsed / duration);
  const lift = Math.sin(Math.PI * p) * 0.35;
  if (p < 0.5) return { angle: easeInCubic(p * 2) * (Math.PI / 2), lift, swapped: false, done: false };
  return { angle: -(1 - easeOutCubic((p - 0.5) * 2)) * (Math.PI / 2), lift, swapped: true, done: p >= 1 };
}

/** Stable 0…1 hash of a string (phase offsets for bob, shake, sheets). */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
