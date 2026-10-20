import { describe, expect, it } from "vitest";
import type { HistoryRow, Thumbnail } from "../types/api";
import {
  captionLine,
  deleteUrl,
  enterAction,
  formatWhen,
  galaxyHrefFromApi,
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
import { buildGalaxy, KIND_CORE, KIND_NODE } from "./geometry";
import { galleryParams, neighbour, rubberBand, scrollBounds, scrollToReveal, slotX } from "./layout";

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

  it("says 没有星图 only for finished or failed studies without a graph", () => {
    const at = new Date(2026, 9, 20, 12, 0).toISOString();
    expect(captionLine(row("a", { constellation: false, created_at: at }))).toBe("已完成 · 没有星图 · 2026-10-20 12:00");
    expect(captionLine(row("a", { constellation: false, status: "failed", created_at: at }))).toBe("未完成 · 没有星图 · 2026-10-20 12:00");
    expect(captionLine(row("a", { constellation: false, status: "running", created_at: at }))).toBe("进行中 · 2026-10-20 12:00");
    expect(captionLine(row("a", { created_at: "" }))).toBe("已完成");
  });

  it("maps API hrefs onto galaxy study pages and keeps slashes in delete urls", () => {
    expect(galaxyHrefFromApi("/study/sessions/20261020-101500/1")).toBe("/galaxy/study/sessions/20261020-101500/1");
    expect(galaxyHrefFromApi("/galaxy/study/x/1")).toBe("/galaxy/study/x/1");
    expect(galaxyHrefFromApi(undefined)).toBe("/galaxy/");
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

describe("layout", () => {
  it("backs the camera off on narrow screens", () => {
    const wide = galleryParams(1440 / 900);
    const phone = galleryParams(390 / 844);
    expect(wide.compact).toBe(false);
    expect(phone.compact).toBe(true);
    expect(phone.camDist).toBeGreaterThan(wide.camDist);
    expect(phone.halfWidth).toBeGreaterThan(3);
    expect(wide.rowY[0]).toBeGreaterThan(wide.rowY[1]);
  });

  it("centres rows that fit and pans rows that overflow", () => {
    const params = { spacing: 4, halfWidth: 8, margin: 2 };
    expect(scrollBounds(3, params)).toEqual({ min: 0, max: 0, fits: true });
    const bounds = scrollBounds(6, params);
    expect(bounds).toEqual({ min: 6, max: 14, fits: false });
    expect(slotX(0, 3, 4, true)).toBe(-4);
    expect(slotX(2, 6, 4, false)).toBe(8);
    expect(scrollToReveal(6, 16, params, bounds)).toBe(10);
    expect(scrollToReveal(14, 0, params, bounds)).toBe(6);
    expect(scrollToReveal(6, 8, params, bounds)).toBe(6);
    expect(scrollToReveal(6, 20, params, bounds)).toBe(14);
  });

  it("resists past the bounds", () => {
    expect(rubberBand(3, 0, 10)).toBe(3);
    expect(rubberBand(-5, 0, 10)).toBeGreaterThan(-1.4);
    expect(rubberBand(15, 0, 10)).toBeLessThan(11.4);
  });

  it("moves keyboard focus within and across rows", () => {
    const rows: [string[], string[]] = [["r1", "r2"], ["d1", "d2", "d3", "d4"]];
    expect(neighbour(rows, "r1", "ArrowRight", false)).toBe("r2");
    expect(neighbour(rows, "r2", "ArrowRight", false)).toBe("d1");
    expect(neighbour(rows, "d1", "ArrowLeft", false)).toBe("r2");
    expect(neighbour(rows, "r1", "ArrowLeft", false)).toBeNull();
    expect(neighbour(rows, "r2", "ArrowDown", false)).toBe("d2");
    expect(neighbour(rows, "d4", "ArrowUp", false)).toBe("r2");
    expect(neighbour(rows, "r1", "ArrowUp", false)).toBeNull();
    expect(neighbour(rows, "d3", "End", false)).toBe("d4");
    expect(neighbour(rows, "x", "ArrowUp", false)).toBeNull();
  });
});

describe("geometry", () => {
  const thumb: Thumbnail = {
    ok: true,
    message: "",
    edges: [
      { from: "goal", to: "t1", relation: "parent" },
      { from: "goal", to: "t2", relation: "parent" },
      { from: "t2", to: "t1", relation: "audit" },
    ],
    nodes: [
      { id: "goal", goal: true, x: 700, y: 800, radius: 86, tone: "origin", status: "" },
      { id: "t1", goal: false, x: 140, y: 140, radius: 58, tone: "green", status: "in_progress" },
      { id: "t2", goal: false, x: 1400, y: 900, radius: 44, tone: "violet", status: "resolved" },
    ],
  };

  it("is deterministic and fits the disc", () => {
    const a = buildGalaxy(thumb, "sessions/x/1");
    const b = buildGalaxy(thumb, "sessions/x/1");
    expect(Array.from(a.position)).toEqual(Array.from(b.position));
    expect(a.tasks).toBe(2);
    expect(a.edgePosition.length).toBe(3 * 6);
    const nodes = Array.from(a.kind).flatMap((kind, index) => (kind === KIND_NODE ? [index] : []));
    expect(nodes).toHaveLength(2);
    for (const index of nodes) {
      expect(Math.hypot(a.position[index * 3]!, a.position[index * 3 + 2]!)).toBeLessThanOrEqual(1.25 + 1e-6);
    }
    expect(Array.from(a.kind).filter((kind) => kind === KIND_CORE)).toHaveLength(1);
  });

  it("builds a proto-galaxy without a graph or for a lone goal", () => {
    const none = buildGalaxy(null, "a");
    expect(none.hasGraph).toBe(false);
    expect(none.tasks).toBe(0);
    expect(none.edgePosition.length).toBe(0);
    const lone = buildGalaxy({ ok: true, message: "", edges: [], nodes: [thumb.nodes[0]!] }, "land/1");
    expect(lone.hasGraph).toBe(true);
    expect(Array.from(lone.position).every(Number.isFinite)).toBe(true);
  });
});
