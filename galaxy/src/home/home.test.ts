import { describe, expect, it, vi } from "vitest";
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
import { navigate, resetNavigation } from "./flags";
import { buildGalaxy, KIND_CORE, KIND_NODE } from "./geometry";
import {
  captionWidth,
  columnCount,
  galleryLines,
  galleryParams,
  gridLayout,
  neighbour,
  pxPerUnit,
  scrollBounds,
  scrollToReveal,
  slotPose,
  viewBand,
} from "./layout";

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
  const params = (w: number, h: number) => galleryParams(w / h);

  it("backs the camera off on narrow screens", () => {
    const wide = params(1440, 900);
    const phone = params(390, 844);
    expect(wide.compact).toBe(false);
    expect(phone.compact).toBe(true);
    expect(phone.camDist).toBeGreaterThan(wide.camDist);
    expect(phone.halfWidth).toBeGreaterThan(3);
  });

  it("fits as many columns as the viewport allows (at least one)", () => {
    expect(columnCount(params(1920, 1000))).toBe(5);
    expect(columnCount(params(1440, 900))).toBe(4);
    expect(columnCount(params(390, 844))).toBe(2);
    expect(columnCount({ halfWidth: 1, edge: 1.55, spacing: 3.45 })).toBe(1);
    // Every galaxy of a full line stays on screen.
    for (const [w, h] of [[1920, 1000], [1440, 900], [1280, 800], [1024, 768], [390, 844]] as const) {
      const p = params(w, h);
      const outer = ((columnCount(p) - 1) / 2) * p.spacing + p.galaxyRadius;
      expect(outer).toBeLessThanOrEqual(p.halfWidth);
    }
  });

  it("keeps neighbouring captions apart", () => {
    const p = params(1920, 1000);
    const ppu = pxPerUnit(p, 1000);
    expect(captionWidth(p, ppu)).toBe(264);
    const phone = params(390, 844);
    const width = captionWidth(phone, pxPerUnit(phone, 844));
    expect(width).toBeLessThan(phone.spacing * pxPerUnit(phone, 844));
  });

  it("wraps each section into centred lines, 调研中 above 已完成", () => {
    const p = params(1920, 1000);
    const ppu = pxPerUnit(p, 1000);
    const layout = gridLayout([3, 6], p, ppu);
    expect(layout.cols).toBe(5);
    const [running, done] = layout.slots;
    expect(running).toHaveLength(3);
    expect(done).toHaveLength(6);
    // One centred line of 3.
    expect(running.map((slot) => slot.x)).toEqual([-p.spacing, 0, p.spacing]);
    expect(new Set(running.map((slot) => slot.y)).size).toBe(1);
    // 已完成: a full line of 5, then 1 centred below it.
    expect(new Set(done.slice(0, 5).map((slot) => slot.y)).size).toBe(1);
    expect(done[0]!.x).toBeCloseTo(-2 * p.spacing);
    expect(done[5]!.x).toBe(0);
    expect(done[5]!.y).toBeLessThan(done[0]!.y);
    // Sections and headings stack downward without overlapping a caption.
    expect(layout.headingY[0]).toBe(0);
    expect(layout.headingY[1]).toBeLessThan(running[0]!.y - layout.below);
    expect(done[0]!.y + p.above).toBeLessThan(layout.headingY[1]);
    const pitch = done[0]!.y - done[5]!.y;
    expect(pitch).toBeGreaterThan(p.above + layout.below);
    expect(layout.height).toBeGreaterThan(-done[5]!.y + layout.below);
    expect(layout.left).toBeCloseTo(-2 * p.spacing);
  });

  it("gives empty sections a note and a single column on tiny screens", () => {
    const p = { ...params(1440, 900), halfWidth: 2 };
    const layout = gridLayout([0, 3], p, 80);
    expect(layout.cols).toBe(1);
    expect(layout.slots[0]).toEqual([]);
    expect(layout.emptyY[0]).toBeLessThan(layout.headingY[0]);
    expect(layout.emptyY[0]).toBeGreaterThan(layout.headingY[1]);
    expect(layout.slots[1].map((slot) => slot.x)).toEqual([0, 0, 0]);
    expect(layout.slots[1][1]!.y).toBeLessThan(layout.slots[1][0]!.y);
  });

  it("scrolls vertically only when the content is taller than the free band", () => {
    const p = params(1440, 900);
    const band = viewBand(p, 900, 130);
    const ppu = pxPerUnit(p, 900);
    expect(band.top).toBeCloseTo(p.halfHeight - 72 / ppu);
    expect(band.bottom).toBeCloseTo(-p.halfHeight + 130 / ppu);
    const short = scrollBounds({ height: 2 }, band);
    expect(short.fits).toBe(true);
    expect(short.max).toBe(0);
    // Centred in the band.
    expect(short.top - 2 - band.bottom).toBeCloseTo(band.top - short.top);
    const tall = scrollBounds({ height: 30 }, band);
    expect(tall).toEqual({ min: 0, max: 30 - (band.top - band.bottom), fits: false, top: band.top });
  });

  it("scrolls just enough to reveal a slot", () => {
    const band = { top: 5, bottom: -5 };
    const bounds = { min: 0, max: 20, fits: false, top: 5 };
    const p = { above: 1 };
    const layout = { below: 2 };
    // Already in view: unchanged.
    expect(scrollToReveal(0, -2, p, layout, band, bounds)).toBe(0);
    // Below the band: raise it until the caption bottom touches the band bottom.
    expect(scrollToReveal(0, -14, p, layout, band, bounds)).toBeCloseTo(6);
    expect(scrollToReveal(0, -14, p, layout, band, bounds, 0.5)).toBeCloseTo(6.5);
    // Above the band: lower it until the galaxy top touches the band top.
    expect(scrollToReveal(10, -2, p, layout, band, bounds)).toBeCloseTo(1);
    // Clamped to the limits, and nothing scrolls when everything fits.
    expect(scrollToReveal(0, -60, p, layout, band, bounds)).toBe(20);
    expect(scrollToReveal(3, -60, p, layout, band, { ...bounds, fits: true })).toBe(0);
  });

  it("bends lines away from the camera and turns galaxies toward it", () => {
    const p = params(1440, 900);
    const centre = slotPose(0, 1, p);
    const side = slotPose(4, 1, p);
    expect(centre).toEqual({ x: 0, y: 1, z: -0, rotY: -0 });
    expect(side.z).toBeLessThan(0);
    expect(side.rotY).toBeLessThan(0);
  });

  it("moves keyboard focus through wrapped lines", () => {
    const lines = galleryLines([["r1", "r2", "r3"], ["d1", "d2", "d3", "d4", "d5", "d6"]], 4);
    expect(lines.map((line) => line.items.map((item) => item.id))).toEqual([["r1", "r2", "r3"], ["d1", "d2", "d3", "d4"], ["d5", "d6"]]);
    expect(lines[2]!.section).toBe(1);
    // Left/Right follow reading order across lines and sections.
    expect(neighbour(lines, "r1", "ArrowRight")).toBe("r2");
    expect(neighbour(lines, "r3", "ArrowRight")).toBe("d1");
    expect(neighbour(lines, "d1", "ArrowLeft")).toBe("r3");
    expect(neighbour(lines, "d4", "ArrowRight")).toBe("d5");
    expect(neighbour(lines, "r1", "ArrowLeft")).toBeNull();
    expect(neighbour(lines, "d6", "ArrowRight")).toBeNull();
    // Up/Down go to the nearest galaxy on the neighbouring line (lines are centred).
    expect(neighbour(lines, "r2", "ArrowDown")).toBe("d2");
    expect(neighbour(lines, "d4", "ArrowUp")).toBe("r3");
    expect(neighbour(lines, "d2", "ArrowDown")).toBe("d5");
    expect(neighbour(lines, "d3", "ArrowDown")).toBe("d6");
    expect(neighbour(lines, "d6", "ArrowUp")).toBe("d3");
    expect(neighbour(lines, "r1", "ArrowUp")).toBeNull();
    expect(neighbour(lines, "d5", "ArrowDown")).toBeNull();
    // Home/End stay within the section.
    expect(neighbour(lines, "d5", "Home")).toBe("d1");
    expect(neighbour(lines, "d1", "End")).toBe("d6");
    expect(neighbour(lines, "r2", "End")).toBe("r3");
    expect(neighbour(lines, "x", "ArrowUp")).toBeNull();
    // One column: Up/Down walk the list.
    const single = galleryLines([["a"], ["b", "c"]], 1);
    expect(neighbour(single, "a", "ArrowDown")).toBe("b");
    expect(neighbour(single, "c", "ArrowUp")).toBe("b");
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

describe("navigate", () => {
  it("leaves once until reset (dive, watchdog and repeated flights share one navigation)", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    try {
      navigate("/galaxy/study/a");
      navigate("/galaxy/study/a");
      navigate("/galaxy/study/b");
      expect(assign.mock.calls).toEqual([["/galaxy/study/a"]]);
      resetNavigation();
      navigate("/galaxy/study/b");
      expect(assign.mock.calls).toEqual([["/galaxy/study/a"], ["/galaxy/study/b"]]);
    } finally {
      resetNavigation();
      vi.unstubAllGlobals();
    }
  });
});
