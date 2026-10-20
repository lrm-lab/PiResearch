// Home polling (spec 2.2, constellation/home.html:167-278, 409-439):
// - GET /api/history?compact=1 with ETag every min(30000, 3000·2^failures) ms,
//   paused while the tab is hidden, refreshed on visibilitychange / pageshow.
// - Each study's /thumbnail is loaded once when it becomes visible. Running
//   studies re-poll it every 2 s, only while visible and the tab is shown.
// Never touches /view or /snapshot.

import { fetchHistory, fetchThumbnail, studyApiPrefix } from "../lib/api";
import type { HistoryRow } from "../types/api";
import { flags } from "./flags";
import { HISTORY_FAILED, historyDelay, nextFailures, thumbSignature } from "./format";
import { useHome } from "./store";

const THUMB_LIVE_MS = 2000;

interface Watch {
  live: boolean;
  loaded: boolean;
  busy: boolean;
  /** Fetch again once the in-flight request settles (the study finished meanwhile). */
  again: boolean;
  visible: boolean;
  etag: string | null;
  sig: string;
  timer: ReturnType<typeof setTimeout> | null;
}

const watches = new Map<string, Watch>();
/** Last reported on-screen state, also for ids whose watch does not exist yet. */
const onScreen = new Map<string, boolean>();
let historyTimer: ReturnType<typeof setTimeout> | null = null;
let historyEtag: string | null = null;
let historyBusy = false;
/** A refresh was asked for while one was in flight: run one more right after it. */
let historyAgain = false;
let historyFailures = 0;
let running = false;

function clearWatchTimer(watch: Watch) {
  if (watch.timer !== null) clearTimeout(watch.timer);
  watch.timer = null;
}

async function loadThumb(id: string): Promise<void> {
  const watch = watches.get(id);
  if (!watch || watch.busy || document.hidden || !watch.visible || !running) return;
  if (watch.loaded && !watch.live) return;
  clearWatchTimer(watch);
  watch.busy = true;
  try {
    const result = await fetchThumbnail(studyApiPrefix(id), { etag: watch.etag });
    if (watches.get(id) !== watch) return;
    watch.loaded = true;
    if (result.notModified) return;
    if (result.etag) watch.etag = result.etag;
    // A study that finished stops polling even before history says so.
    if (result.data.running === false) watch.live = false;
    const sig = thumbSignature(result.data);
    if (sig === watch.sig && useHome.getState().thumbs[id]) return;
    watch.sig = sig;
    useHome.getState().setThumb(id, result.data);
  } catch {
    /* keep the last geometry; a live study retries on its next tick */
  } finally {
    watch.busy = false;
    if (watches.get(id) === watch && watch.again) {
      // The in-flight response may predate the finish: fetch the final shape now.
      watch.again = false;
      watch.loaded = false;
      void loadThumb(id);
    } else if (watches.get(id) === watch && watch.live && watch.visible && !document.hidden && running) {
      clearWatchTimer(watch);
      watch.timer = setTimeout(() => void loadThumb(id), THUMB_LIVE_MS);
    }
  }
}

/** Track the current rows: new ids get a watch, gone ids are dropped. */
function syncWatches(rows: readonly HistoryRow[]) {
  const ids = new Set(rows.map((row) => row.id));
  for (const [id, watch] of watches) {
    if (!ids.has(id)) {
      clearWatchTimer(watch);
      watches.delete(id);
      onScreen.delete(id);
    }
  }
  for (const row of rows) {
    const live = row.status === "running";
    const watch = watches.get(row.id);
    if (!watch) {
      const visible = onScreen.get(row.id) ?? false;
      watches.set(row.id, { live, loaded: false, busy: false, again: false, visible, etag: null, sig: "", timer: null });
      if (visible) void loadThumb(row.id);
      continue;
    }
    if (live && !watch.live) {
      watch.live = true;
      void loadThumb(row.id);
    } else if (!live && watch.live) {
      // Finished: fetch once more for the final shape, then stop.
      watch.live = false;
      watch.loaded = false;
      clearWatchTimer(watch);
      if (watch.busy) watch.again = true;
      else void loadThumb(row.id);
    }
  }
}

/** The scene / card grid reports which studies are on screen. */
export function setThumbVisible(id: string, visible: boolean): void {
  onScreen.set(id, visible);
  const watch = watches.get(id);
  if (!watch || watch.visible === visible) return;
  watch.visible = visible;
  if (visible) void loadThumb(id);
  else clearWatchTimer(watch);
}

async function refreshHistory(): Promise<void> {
  if (!running || historyBusy || document.hidden) return;
  historyAgain = false;
  if (historyTimer !== null) clearTimeout(historyTimer);
  historyTimer = null;
  historyBusy = true;
  const store = useHome.getState();
  try {
    if (flags.mockEmpty) {
      store.applyHistory([]);
    } else {
      const result = await fetchHistory({ etag: historyEtag });
      if (!running) return;
      if (!result.notModified) {
        if (result.etag) historyEtag = result.etag;
        useHome.getState().applyHistory(result.data);
      }
    }
    historyFailures = 0;
    syncWatches(useHome.getState().rows ?? []);
  } catch {
    historyFailures = nextFailures(historyFailures);
    if (!useHome.getState().rows?.length) useHome.getState().setLoadError(HISTORY_FAILED);
  } finally {
    historyBusy = false;
    if (historyAgain) void refreshHistory();
    else if (running && !document.hidden) historyTimer = setTimeout(() => void refreshHistory(), historyDelay(historyFailures));
  }
}

/** Refresh now (after a delete), keeping the ETag; right after the in-flight request if there is one. */
export function refreshHistoryNow(): void {
  if (historyBusy) historyAgain = true;
  else void refreshHistory();
}

function onVisibility() {
  if (document.hidden) {
    if (historyTimer !== null) clearTimeout(historyTimer);
    historyTimer = null;
    for (const watch of watches.values()) clearWatchTimer(watch);
    return;
  }
  void refreshHistory();
  for (const [id, watch] of watches) if (watch.visible && (watch.live || !watch.loaded)) void loadThumb(id);
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) onVisibility();
}

/** Start polling; returns the stop function. */
export function startHomePolling(): () => void {
  running = true;
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  void refreshHistory();
  return () => {
    running = false;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    if (historyTimer !== null) clearTimeout(historyTimer);
    historyTimer = null;
    for (const watch of watches.values()) clearWatchTimer(watch);
  };
}
