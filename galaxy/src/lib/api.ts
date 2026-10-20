// Data access for the galaxy: URL → API prefix, fetch helpers and the
// snapshot poller. Same model as the 2D page (constellation/index.html:2182-2221):
// no-store + ETag revalidation, 15 s timeout, backoff min(15000, 1000·2^failures),
// stop once `running === false`, pause while hidden, skip unchanged revisions.

import type { HistoryRow, NodeDetail, Snapshot, Thumbnail } from "../types/api";

export const REQUEST_TIMEOUT_MS = 15000;
export const MAX_POLL_DELAY_MS = 15000;
const MAX_FAILURES = 4;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A non-2xx, non-304 response. `message` comes from the JSON body when it has one. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// URLs

const STUDY_PATH = /^\/galaxy\/study\/(.+?)\/?$/;

/** "sessions/20261020-101500/1" from "/galaxy/study/sessions/20261020-101500/1/". */
export function studyIdFromPath(pathname: string): string | null {
  const match = STUDY_PATH.exec(pathname);
  return match ? match[1]!.replace(/\/$/, "") : null;
}

/** "/api/studies/<id>" for a galaxy study URL, else null. Ids keep their slashes. */
export function apiPrefix(pathname: string): string | null {
  const id = studyIdFromPath(pathname);
  return id ? studyApiPrefix(id) : null;
}

/** "/api/studies/<id>" for a study id. */
export function studyApiPrefix(id: string): string {
  return `/api/studies/${id}`;
}

/** Galaxy study page for an id. */
export function galaxyStudyHref(id: string): string {
  return `/galaxy/study/${id}`;
}

/** The 2D study page on the main server (used by the no-WebGL notice). */
export function classicStudyHref(id: string): string {
  return `/study/${id}`;
}

// ---------------------------------------------------------------------------
// Fetch helpers

export interface RequestOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Aborts the request early (in addition to the timeout). */
  signal?: AbortSignal;
  /** Sent as If-None-Match. */
  etag?: string | null;
  headers?: Record<string, string>;
}

export type Fetched<T> =
  | { notModified: true; status: 304; etag: string | null }
  | { notModified: false; status: number; data: T; etag: string | null };

function defaultFetch(): FetchLike {
  return (input, init) => globalThis.fetch(input, init);
}

/**
 * fetch with `cache: "no-store"` and a timeout that also covers reading the
 * body. Uses AbortController + setTimeout so fake timers control it.
 */
async function withTimeout<T>(
  url: string,
  init: RequestInit,
  options: RequestOptions,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const outer = options.signal;
  const forward = () => controller.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) forward();
    else outer.addEventListener("abort", forward, { once: true });
  }
  try {
    const response = await fetchImpl(url, { ...init, cache: "no-store", signal: controller.signal });
    return await read(response);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forward);
  }
}

async function failure(response: Response): Promise<HttpError> {
  let body: unknown = null;
  let message = `HTTP ${response.status}`;
  try {
    const text = await response.text();
    body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text body */
    }
    if (body && typeof body === "object") {
      const record = body as { message?: unknown; error?: unknown };
      const picked = record.message || record.error;
      if (typeof picked === "string" && picked) message = picked;
    } else if (typeof body === "string" && body.trim()) {
      message = body.trim();
    }
  } catch {
    /* unreadable body */
  }
  return new HttpError(response.status, message, body);
}

/**
 * True when a study request failed because the study does not exist (404).
 * Network errors, timeouts and 5xx (e.g. the proxy's 502) are transient.
 */
export function isMissingStudy(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 404;
}

/** GET JSON with optional ETag revalidation. Throws HttpError for non-2xx (except 304). */
export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<Fetched<T>> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.etag) headers["If-None-Match"] = options.etag;
  return withTimeout(url, { headers }, options, async (response): Promise<Fetched<T>> => {
    const etag = response.headers.get("ETag");
    if (response.status === 304) return { notModified: true, status: 304, etag };
    if (!response.ok) throw await failure(response);
    return { notModified: false, status: response.status, data: (await response.json()) as T, etag };
  });
}

export async function fetchHistory(options: RequestOptions = {}): Promise<Fetched<HistoryRow[]>> {
  return fetchJson<HistoryRow[]>("/api/history?compact=1", options);
}

export async function fetchThumbnail(prefix: string, options: RequestOptions = {}): Promise<Fetched<Thumbnail>> {
  return fetchJson<Thumbnail>(`${prefix}/thumbnail`, options);
}

export async function fetchSnapshot(prefix: string, options: RequestOptions = {}): Promise<Fetched<Snapshot>> {
  return fetchJson<Snapshot>(`${prefix}/snapshot`, options);
}

/** One node with steps filled. Throws HttpError(404) with "没有这个节点。" for unknown ids. */
export async function fetchNodeDetail(prefix: string, id: string, options: RequestOptions = {}): Promise<NodeDetail> {
  const result = await fetchJson<NodeDetail>(`${prefix}/node?id=${encodeURIComponent(id)}`, options);
  if (result.notModified) throw new HttpError(304, "unexpected 304");
  return result.data;
}

export type ReportResult = { kind: "ready"; markdown: string } | { kind: "missing"; message: string };

/** Report Markdown, or the 404 text (这份运行还没有报告。). Other failures throw. */
export async function fetchReport(prefix: string, options: RequestOptions = {}): Promise<ReportResult> {
  return withTimeout(`${prefix}/report`, { headers: { Accept: "text/plain", ...options.headers } }, options, async (response) => {
    if (response.status === 404) return { kind: "missing", message: (await response.text()).trim() || "这份运行还没有报告。" };
    if (!response.ok) throw await failure(response);
    return { kind: "ready", markdown: await response.text() };
  });
}

// ---------------------------------------------------------------------------
// Snapshot poller

/** Minimal event target so tests can pass `new EventTarget()`. */
export interface EventSource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface PollerOptions {
  /** "/api/studies/<id>". */
  prefix: string;
  /** Called with each snapshot whose `revision` differs from the last one applied. */
  onSnapshot: (snapshot: Snapshot) => void;
  /** Called after each failed snapshot request with the new failure count. */
  onError?: (error: unknown, failures: number) => void;
  /** Called after each successful snapshot request, changed or not (304 included). */
  onSuccess?: () => void;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Defaults to `document.hidden` (false outside a browser). */
  isHidden?: () => boolean;
  /** Receives `visibilitychange`. Defaults to `document`. */
  documentTarget?: EventSource | null;
  /** Receives `pageshow`. Defaults to `window`. */
  windowTarget?: EventSource | null;
}

export type NodeResult =
  /** Steps match the current snapshot (possibly after one forced refresh). */
  | { kind: "ready"; detail: NodeDetail }
  /** The node's steps changed again and the snapshot could not catch up. */
  | { kind: "stale"; detail: NodeDetail };

export interface Poller {
  /** First refresh plus visibility listeners. Idempotent. */
  start(): void;
  /** Stops timers, aborts the in-flight request and removes listeners. */
  stop(): void;
  /** Refresh now. `force` drops the ETag so the server must send the body. */
  refresh(options?: { force?: boolean }): Promise<void>;
  /** Steps of one node, cached by `steps_revision`. A mismatch forces one snapshot refresh. */
  fetchNode(id: string): Promise<NodeResult>;
  /** Last applied snapshot. */
  snapshot(): Snapshot | null;
  failures(): number;
  /** Delay before the next poll, or null when no poll is scheduled. */
  nextDelay(): number | null;
}

export function pollDelay(failures: number): number {
  return Math.min(MAX_POLL_DELAY_MS, 1000 * 2 ** failures);
}

export function createPoller(options: PollerOptions): Poller {
  const hasDocument = typeof document !== "undefined";
  const isHidden = options.isHidden ?? (() => (hasDocument ? document.hidden : false));
  const docTarget = options.documentTarget !== undefined ? options.documentTarget : hasDocument ? document : null;
  const winTarget = options.windowTarget !== undefined ? options.windowTarget : typeof window !== "undefined" ? window : null;
  const request = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const snapshotUrl = `${options.prefix}/snapshot`;

  let current: Snapshot | null = null;
  let etag: string | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scheduledDelay: number | null = null;
  let inflight: Promise<void> | null = null;
  let again = false;
  let forceNext = false;
  let started = false;
  let stopped = false;
  let abort: AbortController | null = null;
  const nodeCache = new Map<string, NodeDetail>();
  const nodeRequests = new Map<string, Promise<NodeResult>>();

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    scheduledDelay = null;
  }

  function schedule() {
    clearTimer();
    if (stopped || isHidden() || current?.running === false) return;
    scheduledDelay = pollDelay(failures);
    timer = setTimeout(() => {
      timer = null;
      scheduledDelay = null;
      void refresh();
    }, scheduledDelay);
  }

  async function once() {
    clearTimer();
    abort = new AbortController();
    try {
      const result = await fetchJson<Snapshot>(snapshotUrl, { ...request, etag, signal: abort.signal });
      if (stopped) return;
      if (!result.notModified) {
        if (result.etag) etag = result.etag;
        const next = result.data;
        if (!(current?.revision && next.revision === current.revision)) {
          current = next;
          options.onSnapshot(next);
        }
      }
      failures = 0;
      options.onSuccess?.();
    } catch (error) {
      if (stopped) return;
      failures = Math.min(MAX_FAILURES, failures + 1);
      options.onError?.(error, failures);
    } finally {
      abort = null;
    }
  }

  function refresh(opts: { force?: boolean } = {}): Promise<void> {
    if (opts.force) {
      etag = null;
      forceNext = true;
    }
    if (stopped || isHidden()) return Promise.resolve();
    if (inflight) {
      // A forced refresh must not be satisfied by a request sent before it.
      if (opts.force) again = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        do {
          again = false;
          if (forceNext) etag = null;
          forceNext = false;
          await once();
        } while (again && !stopped);
      } finally {
        inflight = null;
        schedule();
      }
    })();
    return inflight;
  }

  const onVisibility = () => {
    if (isHidden()) clearTimer();
    else void refresh();
  };
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) void refresh();
  };

  function revisionOf(id: string): string | undefined {
    return current?.nodes.find((node) => node.id === id)?.steps_revision;
  }

  async function loadNode(id: string): Promise<NodeResult> {
    const detail = await fetchNodeDetail(options.prefix, id, request);
    if (revisionOf(id) === detail.steps_revision) {
      nodeCache.set(id, detail);
      return { kind: "ready", detail };
    }
    // The snapshot is behind the node: refresh it once, without the ETag.
    await refresh({ force: true });
    if (revisionOf(id) === detail.steps_revision) {
      nodeCache.set(id, detail);
      return { kind: "ready", detail };
    }
    return { kind: "stale", detail };
  }

  return {
    start() {
      if (started || stopped) return;
      started = true;
      docTarget?.addEventListener("visibilitychange", onVisibility);
      winTarget?.addEventListener("pageshow", onPageShow);
      void refresh();
    },
    stop() {
      stopped = true;
      clearTimer();
      abort?.abort(new Error("stopped"));
      docTarget?.removeEventListener("visibilitychange", onVisibility);
      winTarget?.removeEventListener("pageshow", onPageShow);
    },
    refresh,
    fetchNode(id: string) {
      const revision = revisionOf(id);
      const cached = nodeCache.get(id);
      if (cached && revision !== undefined && cached.steps_revision === revision) {
        return Promise.resolve({ kind: "ready", detail: cached });
      }
      const key = `${id}:${revision ?? ""}`;
      const existing = nodeRequests.get(key);
      if (existing) return existing;
      const pending = loadNode(id).finally(() => nodeRequests.delete(key));
      nodeRequests.set(key, pending);
      return pending;
    },
    snapshot: () => current,
    failures: () => failures,
    nextDelay: () => scheduledDelay,
  };
}
