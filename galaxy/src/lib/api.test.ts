import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, ViewNode } from "../types/api";
import {
  apiPrefix,
  classicStudyHref,
  createPoller,
  fetchJson,
  fetchReport,
  galaxyStudyHref,
  HttpError,
  isMissingStudy,
  pollDelay,
  studyIdFromPath,
  type FetchLike,
  type PollerOptions,
} from "./api";

const PREFIX = "/api/studies/sessions/20261020-101500/1";

function node(id: string, revision: string, extra: Partial<ViewNode> = {}): ViewNode {
  return {
    id, title: id, goal: id === "goal", x: 0, y: 0, radius: 44, tone: "green", weight: "node", agents: [],
    status: "open", notes: "", children: [], steps: [], live: [], step_count: 1, steps_revision: revision, steps_loaded: false,
    ...extra,
  };
}

function snapshot(revision: string, extra: Partial<Snapshot> = {}, nodeRevision = "s1"): Snapshot {
  return {
    ok: true, message: "", goal: { id: "goal", title: "Q" }, nodes: [node("goal", "g"), node("t1", nodeRevision)], edges: [],
    radius: 62, report: false, version: 1, running: true, revision, detail_mode: "on-demand", ...extra,
  };
}

interface Call {
  url: string;
  ifNoneMatch: string | null;
  cache: RequestCache | undefined;
  signal: AbortSignal | undefined;
}

/** A scripted fetch. Each handler returns a Response or a promise; unmatched URLs 404. */
function fakeFetch(handlers: { snapshot?: () => Response | Promise<Response>; node?: () => Response | Promise<Response> }) {
  const calls: Call[] = [];
  const impl: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url, ifNoneMatch: headers.get("If-None-Match"), cache: init?.cache, signal: init?.signal ?? undefined });
    if (url.endsWith("/snapshot") && handlers.snapshot) return handlers.snapshot();
    if (url.includes("/node?id=") && handlers.node) return handlers.node();
    return new Response('{"ok":false,"message":"没有这项研究。"}', { status: 404 });
  };
  return { impl, calls, snapshots: () => calls.filter((call) => call.url.endsWith("/snapshot")) };
}

const json = (body: unknown, etag?: string) =>
  new Response(JSON.stringify(body), { status: 200, headers: etag ? { ETag: etag, "Content-Type": "application/json" } : {} });

function makePoller(impl: FetchLike, extra: Partial<PollerOptions> = {}) {
  const applied: Snapshot[] = [];
  const errors: number[] = [];
  const doc = new EventTarget();
  const win = new EventTarget();
  let hidden = false;
  const poller = createPoller({
    prefix: PREFIX,
    fetchImpl: impl,
    onSnapshot: (view) => applied.push(view),
    onError: (_error, failures) => errors.push(failures),
    isHidden: () => hidden,
    documentTarget: doc,
    windowTarget: win,
    ...extra,
  });
  return {
    poller, applied, errors, doc, win,
    setHidden(value: boolean) {
      hidden = value;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

describe("URL helpers", () => {
  it("derives the study id and API prefix from galaxy paths", () => {
    expect(studyIdFromPath("/galaxy/study/sessions/20261020-101500/1")).toBe("sessions/20261020-101500/1");
    expect(studyIdFromPath("/galaxy/study/land/1/")).toBe("land/1");
    expect(studyIdFromPath("/galaxy/")).toBeNull();
    expect(studyIdFromPath("/study/land/1")).toBeNull();
    expect(apiPrefix("/galaxy/study/sessions/20261020-101500/1")).toBe(PREFIX);
    expect(apiPrefix("/galaxy/")).toBeNull();
    expect(galaxyStudyHref("land/1")).toBe("/galaxy/study/land/1");
    expect(classicStudyHref("land/1")).toBe("/study/land/1");
  });
});

describe("fetch helpers", () => {
  it("sends no-store and If-None-Match, and reports 304 as not modified", async () => {
    const { impl, calls } = fakeFetch({ snapshot: () => new Response(null, { status: 304, headers: { ETag: 'W/"a"' } }) });
    const result = await fetchJson(`${PREFIX}/snapshot`, { fetchImpl: impl, etag: 'W/"a"' });
    expect(result.notModified).toBe(true);
    expect(calls[0]).toMatchObject({ ifNoneMatch: 'W/"a"', cache: "no-store" });
  });

  it("throws HttpError with the server message", async () => {
    const { impl } = fakeFetch({});
    await expect(fetchJson(`${PREFIX}/snapshot`, { fetchImpl: impl })).rejects.toMatchObject({ status: 404, message: "没有这项研究。" });
    await expect(fetchJson(`${PREFIX}/snapshot`, { fetchImpl: impl })).rejects.toBeInstanceOf(HttpError);
  });

  it("treats only a 404 as a missing study", () => {
    expect(isMissingStudy(new HttpError(404, "没有这项研究。"))).toBe(true);
    expect(isMissingStudy(new HttpError(502, "星图服务暂时不可用。"))).toBe(false);
    expect(isMissingStudy(new HttpError(500, "HTTP 500"))).toBe(false);
    expect(isMissingStudy(new TypeError("Failed to fetch"))).toBe(false);
    expect(isMissingStudy(new Error("timeout"))).toBe(false);
  });

  it("returns the report text or the 404 message", async () => {
    const ok: FetchLike = async () => new Response("# 结论", { status: 200 });
    expect(await fetchReport(PREFIX, { fetchImpl: ok })).toEqual({ kind: "ready", markdown: "# 结论" });
    const missing: FetchLike = async () => new Response("这份运行还没有报告。", { status: 404 });
    expect(await fetchReport(PREFIX, { fetchImpl: missing })).toEqual({ kind: "missing", message: "这份运行还没有报告。" });
  });
});

describe("createPoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls every second while healthy and revalidates with the ETag", async () => {
    const fetch = fakeFetch({ snapshot: () => json(snapshot("r1"), 'W/"e1"') });
    const { poller, applied } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.snapshots()).toHaveLength(1);
    expect(fetch.snapshots()[0]!.ifNoneMatch).toBeNull();
    expect(poller.nextDelay()).toBe(1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch.snapshots()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.snapshots()).toHaveLength(2);
    expect(fetch.snapshots()[1]!.ifNoneMatch).toBe('W/"e1"');
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch.snapshots()).toHaveLength(5);
    // Same revision every time: applied once.
    expect(applied).toHaveLength(1);
    poller.stop();
  });

  it("treats 304 as unchanged", async () => {
    let first = true;
    const fetch = fakeFetch({
      snapshot: () => {
        if (first) {
          first = false;
          return json(snapshot("r1"), 'W/"e1"');
        }
        return new Response(null, { status: 304 });
      },
    });
    const { poller, applied, errors } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch.snapshots()).toHaveLength(3);
    expect(applied).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(poller.failures()).toBe(0);
    poller.stop();
  });

  it("calls onSuccess after every successful request, including 304, but not after a failure", async () => {
    const responses = [() => json(snapshot("r1"), 'W/"e1"'), () => new Response(null, { status: 304 }), () => Promise.reject(new TypeError("network"))];
    let i = 0;
    const fetch = fakeFetch({ snapshot: () => responses[Math.min(i++, responses.length - 1)]!() });
    let successes = 0;
    const { poller, errors } = makePoller(fetch.impl, { onSuccess: () => (successes += 1) });
    poller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(successes).toBe(2);
    expect(errors).toEqual([1]);
    poller.stop();
  });

  it("applies a new revision and skips an unchanged one", async () => {
    const revisions = ["r1", "r1", "r2", "r2"];
    let i = 0;
    const fetch = fakeFetch({ snapshot: () => json(snapshot(revisions[Math.min(i++, revisions.length - 1)]!)) });
    const { poller, applied } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(applied.map((view) => view.revision)).toEqual(["r1", "r2"]);
    expect(poller.snapshot()?.revision).toBe("r2");
    poller.stop();
  });

  it("backs off min(15000, 1000·2^failures) and recovers", async () => {
    let fail = true;
    const fetch = fakeFetch({ snapshot: () => (fail ? Promise.reject(new TypeError("network")) : json(snapshot("r1"))) });
    const { poller, errors } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const delays: (number | null)[] = [poller.nextDelay()];
    for (let k = 0; k < 5; k += 1) {
      await vi.advanceTimersByTimeAsync(poller.nextDelay()!);
      delays.push(poller.nextDelay());
    }
    expect(delays).toEqual([2000, 4000, 8000, 15000, 15000, 15000]);
    expect(errors).toEqual([1, 2, 3, 4, 4, 4]);
    fail = false;
    await vi.advanceTimersByTimeAsync(15000);
    expect(poller.failures()).toBe(0);
    expect(poller.nextDelay()).toBe(1000);
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(10)).toBe(15000);
    poller.stop();
  });

  it("counts a 15 s timeout as a failure", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const { poller, errors } = makePoller(hanging);
    poller.start();
    await vi.advanceTimersByTimeAsync(14999);
    expect(errors).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(errors).toEqual([1]);
    expect(poller.nextDelay()).toBe(2000);
    poller.stop();
  });

  it("stops polling once running is false", async () => {
    const fetch = fakeFetch({ snapshot: () => json(snapshot("done", { running: false })) });
    const { poller, applied } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch.snapshots()).toHaveLength(1);
    expect(applied).toHaveLength(1);
    expect(poller.nextDelay()).toBeNull();
    poller.stop();
  });

  it("pauses while hidden and refreshes on visibilitychange and pageshow", async () => {
    const fetch = fakeFetch({ snapshot: () => json(snapshot("r1")) });
    const { poller, setHidden, win } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    setHidden(true);
    expect(poller.nextDelay()).toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch.snapshots()).toHaveLength(1);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.snapshots()).toHaveLength(2);
    expect(poller.nextDelay()).toBe(1000);

    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    win.dispatchEvent(restored);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.snapshots()).toHaveLength(3);
    win.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.snapshots()).toHaveLength(3);
    poller.stop();
  });

  it("does not start a request while hidden", async () => {
    const fetch = fakeFetch({ snapshot: () => json(snapshot("r1")) });
    const { poller } = makePoller(fetch.impl, { isHidden: () => true });
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch.snapshots()).toHaveLength(0);
    poller.stop();
  });

  it("stop() ends polling and removes listeners", async () => {
    const fetch = fakeFetch({ snapshot: () => json(snapshot("r1")) });
    const { poller, setHidden } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    setHidden(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetch.snapshots()).toHaveLength(1);
  });

  it("caches node details by steps_revision", async () => {
    const fetch = fakeFetch({
      snapshot: () => json(snapshot("r1", { running: false })),
      node: () => json(node("t1", "s1", { steps: [{ tool: "bash", label: "【执行】x", error: false }], steps_loaded: true })),
    });
    const { poller } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const [a, b] = await Promise.all([poller.fetchNode("t1"), poller.fetchNode("t1")]);
    expect(a.kind).toBe("ready");
    expect(b).toBe(a);
    const c = await poller.fetchNode("t1");
    expect(c.kind).toBe("ready");
    expect(fetch.calls.filter((call) => call.url.includes("/node?id="))).toHaveLength(1);
    expect(fetch.calls.find((call) => call.url.includes("/node?id="))!.url).toBe(`${PREFIX}/node?id=t1`);
    poller.stop();
  });

  it("forces exactly one snapshot refresh without the ETag on a steps_revision mismatch", async () => {
    let revision = "r1";
    let nodeRevision = "s1";
    const fetch = fakeFetch({
      snapshot: () => json(snapshot(revision, { running: false }, nodeRevision), `W/"${revision}"`),
      node: () => json(node("t1", "s2", { steps_loaded: true })),
    });
    const { poller, applied } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.snapshots()).toHaveLength(1);
    // The server moved on: node says s2 while our snapshot still says s1.
    revision = "r2";
    nodeRevision = "s2";
    const result = await poller.fetchNode("t1");
    expect(result.kind).toBe("ready");
    expect(fetch.snapshots()).toHaveLength(2);
    expect(fetch.snapshots()[1]!.ifNoneMatch).toBeNull();
    expect(applied.map((view) => view.revision)).toEqual(["r1", "r2"]);
    // Now cached for s2.
    await poller.fetchNode("t1");
    expect(fetch.calls.filter((call) => call.url.includes("/node?id="))).toHaveLength(1);
    poller.stop();
  });

  it("reports stale when the snapshot cannot catch up", async () => {
    const fetch = fakeFetch({
      snapshot: () => json(snapshot("r1", { running: false }, "s1")),
      node: () => json(node("t1", "s9", { steps_loaded: true })),
    });
    const { poller } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const result = await poller.fetchNode("t1");
    expect(result.kind).toBe("stale");
    expect(fetch.snapshots()).toHaveLength(2);
    poller.stop();
  });

  it("a forced refresh during an in-flight request runs again afterwards", async () => {
    let release: (() => void) | null = null;
    let count = 0;
    const fetch = fakeFetch({
      snapshot: () => {
        count += 1;
        if (count === 1) return new Promise<Response>((resolve) => (release = () => resolve(json(snapshot("r1"), 'W/"e1"'))));
        return json(snapshot("r2"), 'W/"e2"');
      },
    });
    const { poller, applied } = makePoller(fetch.impl);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const forced = poller.refresh({ force: true });
    release!();
    await forced;
    expect(fetch.snapshots()).toHaveLength(2);
    expect(fetch.snapshots()[1]!.ifNoneMatch).toBeNull();
    expect(applied.map((view) => view.revision)).toEqual(["r1", "r2"]);
    poller.stop();
  });
});
