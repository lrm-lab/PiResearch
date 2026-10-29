// The selected task's tool calls, as a column of chips beside its tile (the 2D page's satellites,
// in Prism's language). Hovering a chip shows what the call did; clicking scrolls the terminal to
// that step and flashes it.

import { motion } from "motion/react";
import { TOOL } from "../../lib/activity";
import type { Step } from "../../types/api";
import { useStudy } from "../store";

const CHIP_H = 26;
const GAP = 6;
const WIDTH = 168;
const MAX_CHIPS = 14;

const TOOL_COLOR: Record<string, string> = {
  web_search: "#4f6ef7",
  web_fetch: "#0ea5e9",
  bash: "#64748b",
  read_file: "#8b5cf6",
  create_file: "#10b981",
  submit_report: "#f59e0b",
  download_file: "#06b6d4",
  压缩: "#14b8a6",
  思考: "#a855f7",
};

/** Scroll the terminal to a step and flash it; unfolds older steps first when they are collapsed. */
export function focusStep(index: number): void {
  const flash = () => {
    const element = document.querySelector<HTMLElement>(`[data-step="${index}"]`);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.classList.remove("step-flash");
    void element.offsetWidth;
    element.classList.add("step-flash");
    window.setTimeout(() => element.classList.remove("step-flash"), 1500);
  };
  if (document.querySelector(`[data-step="${index}"]`)) {
    flash();
    return;
  }
  const unfold = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.startsWith("显示更早"));
  if (!unfold) return;
  unfold.click();
  window.setTimeout(flash, 80);
}

interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/** Least-overlapping spot for the column: right, left, or a rail at the map's edge. */
function placeColumn(x: number, y: number, r: number, width: number, height: number, columnH: number, obstacles: readonly Obstacle[]) {
  const clampTop = (top: number) => Math.min(Math.max(12, top), Math.max(12, height - columnH - 12));
  const candidates = [
    { side: 1, left: x + r + 22, top: clampTop(y - columnH / 2) },
    { side: -1, left: x - r - 22 - WIDTH, top: clampTop(y - columnH / 2) },
    { side: 1, left: x + r + 22, top: clampTop(y - columnH - r) },
    { side: -1, left: x - r - 22 - WIDTH, top: clampTop(y - columnH - r) },
    { side: 1, left: width - WIDTH - 12, top: clampTop(y - columnH / 2) },
  ].filter((spot) => spot.left >= 12 && spot.left + WIDTH <= width - 12);
  const hits = (spot: { left: number; top: number }) =>
    obstacles.reduce((sum, node) => {
      const dx = Math.max(spot.left - node.x, 0, node.x - (spot.left + WIDTH));
      const dy = Math.max(spot.top - node.y, 0, node.y - (spot.top + columnH));
      return sum + Math.max(0, (node.r + 10 - Math.hypot(dx, dy)) / (node.r + 10));
    }, 0);
  const best = candidates.reduce<{ side: number; left: number; top: number; score: number } | null>((acc, spot) => {
    const score = hits(spot) + Math.hypot(spot.left + WIDTH / 2 - x, spot.top + columnH / 2 - y) / (width + height);
    return !acc || score < acc.score ? { ...spot, score } : acc;
  }, null);
  return best ?? { side: 1, left: Math.max(12, width - WIDTH - 12), top: clampTop(y - columnH / 2) };
}

export function ToolChips({
  steps,
  x,
  y,
  r,
  width,
  height,
  obstacles,
}: {
  steps: readonly Step[];
  x: number;
  y: number;
  r: number;
  width: number;
  height: number;
  obstacles: readonly Obstacle[];
}) {
  const reduced = useStudy((state) => state.reducedMotion);
  const shown = steps.slice(0, MAX_CHIPS);
  const more = steps.length - shown.length;
  const rows = shown.length + (more > 0 ? 1 : 0);
  const columnH = rows * CHIP_H + (rows - 1) * GAP;
  const { side, left, top } = placeColumn(x, y, r, width, height, columnH, obstacles);

  return (
    <div className="pointer-events-none absolute z-20" style={{ left, top, width: WIDTH }} aria-label="工具调用">
      <ul className="flex flex-col" style={{ gap: GAP }} role="list">
        {shown.map((step, index) => (
          <motion.li
            key={`${index}:${step.tool}:${step.label}`}
            initial={reduced ? false : { opacity: 0, x: side === 1 ? -6 : 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: reduced ? 0 : Math.min(index, 10) * 0.02, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              title={step.hint || step.label}
              onClick={() => focusStep(index)}
              className="pointer-events-auto flex w-full items-center gap-1.5 rounded-full border border-secondary bg-primary/95 px-2.5 text-left text-xs text-secondary shadow-xs backdrop-blur-sm outline-none transition hover:-translate-y-px hover:border-brand-300 hover:bg-brand-primary hover:text-brand-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
              style={{ height: CHIP_H }}
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: step.error ? "#ef4444" : (TOOL_COLOR[step.tool] ?? "#94a3b8") }} />
              <span className="shrink-0 font-medium">{TOOL[step.tool] ?? step.tool}</span>
              <span className="min-w-0 flex-1 truncate text-tertiary">{step.label || step.tool}</span>
              {(step.count ?? 1) > 1 && <span className="shrink-0 font-mono text-[10px] text-quaternary tabular">×{step.count}</span>}
            </button>
          </motion.li>
        ))}
        {more > 0 && (
          <li>
            <button
              type="button"
              onClick={() => focusStep(shown.length)}
              className="pointer-events-auto flex w-full items-center justify-center rounded-full border border-dashed border-secondary bg-primary/80 text-xs text-quaternary outline-none transition hover:border-brand-300 hover:text-brand-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
              style={{ height: CHIP_H }}
            >
              还有 {more} 次
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
