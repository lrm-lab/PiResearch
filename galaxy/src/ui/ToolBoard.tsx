// The selected task's tool calls as a chip row at the head of 工具步骤 (the 2D page's satellites).
// Hovering a chip shows the call; clicking scrolls the signal trace to that step and flashes it.

import type { CSSProperties } from "react";
import { TOOL } from "../lib/activity";
import type { Step } from "../types/api";

const MAX_CHIPS = 16;

const TOOL_COLOR: Record<string, string> = {
  web_search: "#6d9cff",
  web_fetch: "#48d3e4",
  bash: "#8ea0b3",
  read_file: "#aa8cff",
  create_file: "#58d69a",
  submit_report: "#f4c56a",
  download_file: "#48d3e4",
  压缩: "#7ddec8",
  思考: "#a855f7",
};

/** Scroll the signal trace to a step and flash it. */
export function focusStep(index: number): void {
  const element = document.querySelector<HTMLElement>(`[data-step="${index}"]`);
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.classList.remove("trace-flash");
  void element.offsetWidth;
  element.classList.add("trace-flash");
  window.setTimeout(() => element.classList.remove("trace-flash"), 1500);
}

export function ToolChipsRow({ steps }: { steps: readonly Step[] }) {
  if (!steps.length) return null;
  const shown = steps.slice(0, MAX_CHIPS);
  const more = steps.length - shown.length;
  return (
    <ul className="gx-tool-list" aria-label="工具调用">
      {shown.map((step, index) => (
        <li key={`${index}:${step.tool}:${step.label}`}>
          <button
            type="button"
            className="gx-toolchip"
            title={step.hint || step.label}
            style={{ "--gx-chip": step.error ? "#ff7d85" : (TOOL_COLOR[step.tool] ?? "#94a3b8") } as CSSProperties}
            onClick={() => focusStep(index)}
          >
            <span className="gx-toolchip-dot" aria-hidden="true" />
            <span className="gx-toolchip-tool">{TOOL[step.tool] ?? step.tool}</span>
            <span className="gx-toolchip-label">{step.label || step.tool}</span>
            {(step.count ?? 1) > 1 && <span className="gx-toolchip-count">×{step.count}</span>}
          </button>
        </li>
      ))}
      {more > 0 && (
        <li>
          <button type="button" className="gx-toolchip gx-toolchip-more" onClick={() => focusStep(shown.length)}>
            还有 {more} 次
          </button>
        </li>
      )}
    </ul>
  );
}
