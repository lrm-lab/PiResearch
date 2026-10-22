// Fonts for the canvas card faces. Canvas text only uses a web font once it is loaded, and
// Noto Sans SC is sliced by unicode-range: `document.fonts.ready` alone resolves before the slices
// a title needs are fetched. So we ask for exactly the glyphs we draw, then wait for `ready`.

import { useEffect, useState } from "react";

export const SANS = '"Inter Variable", "Noto Sans SC Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
export const MONO = '"JetBrains Mono Variable", "Noto Sans SC Variable", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Copy the faces always draw (state labels, units). */
const FIXED = "未开始进行中已完成已取消存在错误待分配研究任务次调用";
const TIMEOUT_MS = 2500;

function loadAll(sample: string): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const text = `${sample}${FIXED}`;
  const loads = [
    document.fonts.load(`600 18px "Noto Sans SC Variable"`, text),
    document.fonts.load(`500 12px "Noto Sans SC Variable"`, text),
    document.fonts.load(`600 18px "Inter Variable"`, "Aa0"),
    document.fonts.load(`500 12px "Inter Variable"`, "Aa0"),
    document.fonts.load(`500 12px "JetBrains Mono Variable"`, "0123456789t"),
  ];
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  return Promise.race([Promise.allSettled(loads).then(() => document.fonts.ready), timeout]);
}

/**
 * 0 until the glyphs of `sample` are loaded (or a 2.5 s timeout passes), then a version that bumps
 * each time a new sample finishes loading, so textures can redraw with the real fonts.
 */
export function useFontsReady(sample: string): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadAll(sample).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [sample]);
  return version;
}
