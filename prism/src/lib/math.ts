// Seeded randomness shared by the procedural scenes. No three.js import.

/** Small seeded PRNG (mulberry32). A zero seed falls back to 0x9e3779b9. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller); the first draw is clamped to at least `min`. */
export function gauss(next: () => number, min: number): number {
  const u = Math.max(min, next());
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
