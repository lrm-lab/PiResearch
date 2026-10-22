import { describe, expect, it, vi } from "vitest";
import type { HistoryRow, Thumbnail } from "../types/api";
import {
  captionLine,
  deleteUrl,
  enterAction,
  formatWhen,
  prismHrefFromApi,
  historyDelay,
  mergeRows,
  nextFailures,
  splitRows,
  THUMB_MAX_RADIUS,
  THUMB_MIN_SPAN,
  thumbFrame,
  thumbSignature,
  thumbStats,
} from "./format";
import { navigate, resetNavigation } from "./flags";
import { resetHomeStore, useHome } from "./store";

function row(id: string, patch: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id,
    title: `t ${id}`,
    status: "finished",
    constellation: true,
    report: false,
    created_at: "2026-10-20T10:15:00+08:00",
    error: "",
    href: `/study/${id}`,
    ...patch,
  };
}

describe("format", () => {
  it("backs off history polls like the 2D home", () => {
    expect([0, 1, 2, 3, 4, 9].map(historyDelay)).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
    expect(nextFailures(3)).toBe(4);
    expect(nextFailures(4)).toBe(4);
  });

  it("formats local stamps and rejects bad ones", () => {
    const stamp = new Date(2026, 9, 20, 9, 5).toISOString();
    expect(formatWhen(stamp)).toBe("2026-10-20 09:05");
    expect(formatWhen("nope")).toBe("");
    expect(formatWhen("")).toBe("");
  });

  it("says 没有任务图 only for finished or failed studies without a graph", () => {
    const at = new Date(2026, 9, 20, 12, 0).toISOString();
    expect(captionLine(row("a", { constellation: false, created_at: at }))).toBe("已完成 · 没有任务图 · 2026-10-20 12:00");
    expect(captionLine(row("a", { constellation: false, status: "failed", created_at: at }))).toBe("未完成 · 没有任务图 · 2026-10-20 12:00");
    expect(captionLine(row("a", { constellation: false, status: "running", created_at: at }))).toBe("进行中 · 2026-10-20 12:00");
    expect(captionLine(row("a", { created_at: "" }))).toBe("已完成");
  });

  it("maps API hrefs onto Prism study pages and keeps slashes in delete urls", () => {
    expect(prismHrefFromApi("/study/sessions/20261020-101500/1")).toBe("/prism/study/sessions/20261020-101500/1");
    expect(prismHrefFromApi("/prism/study/x/1")).toBe("/prism/study/x/1");
    expect(prismHrefFromApi(undefined)).toBe("/prism/");
    expect(deleteUrl("sessions/2026 a/1")).toBe("/api/studies/sessions/2026%20a/1");
  });

  it("sorts by created_at desc and keeps unchanged row objects", () => {
    const a = row("a", { created_at: "2026-10-20T10:00:00+08:00" });
    const b = row("b", { created_at: "2026-10-20T12:00:00+08:00", status: "running" });
    const first = mergeRows(null, [a, b]);
    expect(first.map((r) => r.id)).toEqual(["b", "a"]);
    const same = mergeRows(first, [{ ...a }, { ...b }]);
    expect(same).toBe(first);
    const changed = mergeRows(first, [{ ...a }, { ...b, status: "finished" }]);
    expect(changed[1]).toBe(a);
    expect(changed[0]).not.toBe(b);
    expect(splitRows(first)).toEqual({ running: [b], done: [a] });
  });

  it("only changes the signature for geometry or status changes", () => {
    const thumb: Thumbnail = {
      ok: true,
      message: "",
      revision: "r1",
      edges: [{ from: "goal", to: "t1", relation: "parent" }],
      nodes: [
        { id: "goal", goal: true, x: 100, y: 100, radius: 80, tone: "origin", status: "" },
        { id: "t1", goal: false, x: 300.2, y: 100, radius: 50, tone: "green", status: "open" },
      ],
    };
    const sig = thumbSignature(thumb);
    expect(thumbSignature({ ...thumb, revision: "r2" })).toBe(sig);
    expect(thumbSignature({ ...thumb, nodes: [thumb.nodes[0]!, { ...thumb.nodes[1]!, status: "resolved" }] })).not.toBe(sig);
    expect(thumbSignature({ ...thumb, ok: false })).toBe("empty");
    expect(thumbStats(thumb)).toEqual({ tasks: 1, resolved: 0, active: 0 });
  });

  it("fits 2D thumbnails without letting a lone node fill the card", () => {
    const lone = thumbFrame([{ x: 140, y: 140, radius: 72 }]);
    const [x, y, w, h] = lone.viewBox;
    expect(w).toBeGreaterThanOrEqual(THUMB_MIN_SPAN);
    expect(h).toBeGreaterThanOrEqual(THUMB_MIN_SPAN);
    expect(x + w / 2).toBeCloseTo(140);
    expect(y + h / 2).toBeCloseTo(140);
    expect(lone.radii[0]).toBeLessThanOrEqual(THUMB_MIN_SPAN * THUMB_MAX_RADIUS);

    // A spread-out map keeps its radii and a tight box.
    const spread = thumbFrame([
      { x: 140, y: 140, radius: 83 },
      { x: 1200, y: 1178, radius: 44 },
      { x: 600, y: 300, radius: 0 },
    ]);
    expect(spread.radii).toEqual([83, 44, 48]);
    expect(spread.viewBox[0]).toBeCloseTo(140 - 83 - 36);
    expect(spread.viewBox[2]).toBeCloseTo(1200 + 44 - (140 - 83) + 72);
    expect(spread.weight).toBeCloseTo((1200 + 44 - (140 - 83)) / 150);
  });

  it("submits on Enter but not with Shift, IME composition or repeats", () => {
    expect(enterAction({ key: "Enter", shiftKey: false })).toBe("submit");
    expect(enterAction({ key: "Enter", shiftKey: true })).toBe("ignore");
    expect(enterAction({ key: "Enter", shiftKey: false, isComposing: true })).toBe("ignore");
    expect(enterAction({ key: "Enter", shiftKey: false, keyCode: 229 })).toBe("ignore");
    expect(enterAction({ key: "Enter", shiftKey: false, repeat: true })).toBe("swallow");
    expect(enterAction({ key: "a", shiftKey: false })).toBe("ignore");
  });
});

describe("store", () => {
  it("drops a deleted study at once and keeps it hidden while history still returns it", () => {
    resetHomeStore();
    const a = row("a", { created_at: "2026-10-20T10:00:00+08:00" });
    const b = row("b", { created_at: "2026-10-20T12:00:00+08:00" });
    useHome.getState().applyHistory([a, b]);
    useHome.getState().hover("a");
    useHome.getState().remove("a");
    expect(useHome.getState().rows!.map((r) => r.id)).toEqual(["b"]);
    expect(useHome.getState().hovered).toBeNull();
    // A history poll that raced the delete still lists it: stay hidden.
    useHome.getState().applyHistory([a, b]);
    expect(useHome.getState().rows!.map((r) => r.id)).toEqual(["b"]);
    // The server forgot it: so does the store, and an id reused later would show again.
    useHome.getState().applyHistory([b]);
    expect(useHome.getState().removed).toEqual({});
    resetHomeStore();
  });

  it("keeps row identity across unchanged polls", () => {
    resetHomeStore();
    useHome.getState().applyHistory([row("a")]);
    const first = useHome.getState().rows;
    useHome.getState().applyHistory([row("a")]);
    expect(useHome.getState().rows).toBe(first);
    resetHomeStore();
  });
});

describe("navigate", () => {
  it("leaves once until reset (dive, watchdog and repeated flights share one navigation)", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    try {
      navigate("/prism/study/a");
      navigate("/prism/study/a");
      navigate("/prism/study/b");
      expect(assign.mock.calls).toEqual([["/prism/study/a"]]);
      resetNavigation();
      navigate("/prism/study/b");
      expect(assign.mock.calls).toEqual([["/prism/study/a"], ["/prism/study/b"]]);
    } finally {
      resetNavigation();
      vi.unstubAllGlobals();
    }
  });
});
