// Tiny colour helper for the orb gradients (SVG stops cannot use CSS colour-mix on every browser).

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mix `hex` toward `toward` by `amount` (0 = hex, 1 = toward). */
export function mixHex(hex: string, toward: string, amount: number): string {
  const a = channels(hex);
  const b = channels(toward);
  const out = a.map((v, i) => Math.round(v + (b[i]! - v) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A DOM/SVG id fragment for a hex colour. */
export const hexId = (hex: string) => hex.replace("#", "").toLowerCase();
