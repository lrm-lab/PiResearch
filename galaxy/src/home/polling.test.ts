import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryRow, Thumbnail } from "../types/api";

const api = vi.hoisted(() => ({ fetchHistory: vi.fn(), fetchThumbnail: vi.fn() }));

vi.mock("../lib/api", () => ({
  fetchHistory: api.fetchHistory,
  fetchThumbnail: api.fetchThumbnail,
  studyApiPrefix: (id: string) => `/api/studies/${id}`,
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Each call returns a new pending promise; `calls[i].resolve` settles call i. */
function queue<T>(mock: ReturnType<typeof vi.fn>): Deferred<T>[] {
  const calls: Deferred<T>[] = [];
  mock.mockImplementation(() => {
    const next = deferred<T>();
    calls.push(next);
    return next.promise;
  });
  return calls;
}

function row(id: string, status: HistoryRow["status"]): HistoryRow {
  return { id, title: id, status, constellation: true, report: false, created_at: "2026-10-20T10:00:00Z", error: "", href: `/study/${id}` };
}

function thumb(running: boolean): Thumbnail {
  return { ok: true, message: "", running, edges: [], nodes: [{ id: "goal", goal: true, x: 0, y: 0, radius: 10, tone: "origin", status: "open" }] };
}

const fetched = <T,>(data: T) => ({ notModified: false as const, status: 200, data, etag: null });

let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  api.fetchHistory.mockReset();
  api.fetchThumbnail.mockReset();
  const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("document", { ...target, hidden: false });
  vi.stubGlobal("window", target);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("home polling", () => {
  it("runs a refresh requested during an in-flight history fetch right after it, once", async () => {
    const history = queue<unknown>(api.fetchHistory);
    const polling = await import("./polling");
    stop = polling.startHomePolling();
    expect(history).toHaveLength(1);

    polling.refreshHistoryNow();
    polling.refreshHistoryNow();
    expect(history).toHaveLength(1);

    history[0]!.resolve(fetched([]));
    await vi.advanceTimersByTimeAsync(0);
    expect(history).toHaveLength(2);

    history[1]!.resolve(fetched([]));
    await vi.advanceTimersByTimeAsync(0);
    expect(history).toHaveLength(2);
  });

  it("fetches the final thumbnail when a study finishes while its thumbnail is loading", async () => {
    const history = queue<unknown>(api.fetchHistory);
    const thumbs = queue<unknown>(api.fetchThumbnail);
    const polling = await import("./polling");
    stop = polling.startHomePolling();
    history[0]!.resolve(fetched([row("a", "running")]));
    await vi.advanceTimersByTimeAsync(0);

    polling.setThumbVisible("a", true);
    expect(thumbs).toHaveLength(1);

    // History says finished while the live thumbnail request is still out.
    polling.refreshHistoryNow();
    history[1]!.resolve(fetched([row("a", "finished")]));
    await vi.advanceTimersByTimeAsync(0);
    expect(thumbs).toHaveLength(1);

    thumbs[0]!.resolve(fetched(thumb(true)));
    await vi.advanceTimersByTimeAsync(0);
    expect(thumbs).toHaveLength(2);

    // The final fetch does not keep polling.
    thumbs[1]!.resolve(fetched(thumb(false)));
    await vi.advanceTimersByTimeAsync(5000);
    expect(thumbs).toHaveLength(2);
  });
});
