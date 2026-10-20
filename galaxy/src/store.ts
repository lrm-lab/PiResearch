// App state shared by the scene (src/scene/**) and the HUD (src/ui/**).
// Data loading lives here; components only read state and call actions.

import { create } from "zustand";
import { createPoller, HttpError, type Poller } from "./lib/api";
import type { Snapshot, Step, ViewNode } from "./types/api";

export type LoadState = "loading" | "ready" | "error";
export type Quality = "auto" | "high" | "low";
export type QualityTier = "high" | "low";

export interface NodeDetailEntry {
  /** `steps_revision` the steps belong to. */
  revision: string;
  steps: Step[];
  state: LoadState;
}

/** What the camera should do. The scene reacts to each new `nonce`. */
export type CameraIntent =
  /** Fly to frame one body. */
  | { kind: "focus"; id: string }
  /** Fly back to the full overview (key R). */
  | { kind: "overview" }
  /** Fly to the core star (key F, 回到主节点). */
  | { kind: "core" };

export type CameraCommand = CameraIntent & { nonce: number };

export const FIRST_LOAD_FAILED = "星图服务没有返回数据，正在重试。";
export const REFRESH_FAILED = "连接中断";

export interface GalaxyState {
  /** Study id from the URL, e.g. "sessions/20261020-101500/1". */
  studyId: string | null;
  /** "/api/studies/<id>". */
  prefix: string | null;
  /** Last applied snapshot. */
  view: Snapshot | null;
  loadState: LoadState;
  /** Message for loadState "error" (or a failed refresh while a view is shown). */
  error: string | null;
  selectedId: string | null;
  hoveredId: string | null;
  /** 核验透镜 (verification lens). */
  lens: boolean;
  quality: Quality;
  /** What the scene renders. With quality "auto" the scene's monitor sets it. */
  effectiveQuality: QualityTier;
  /** Live `prefers-reduced-motion`. */
  reducedMotion: boolean;
  /** Lazily loaded steps by node id. */
  nodeDetails: Record<string, NodeDetailEntry>;
  reportOpen: boolean;
  cameraCommand: CameraCommand | null;

  /** Start polling a study. Returns the cleanup (stops the poller). */
  startStudy(studyId: string, prefix: string): () => void;
  /** Select a node (flies the camera to it and loads its steps) or clear with null. */
  select(id: string | null): void;
  hover(id: string | null): void;
  toggleLens(): void;
  setQuality(quality: Quality): void;
  /** Used by the scene's frame-time monitor; ignored unless quality is "auto". */
  setAutoTier(tier: QualityTier): void;
  openReport(): void;
  closeReport(): void;
  /** Fetch a node's steps if they are not cached for its current steps_revision. */
  loadNode(id: string): Promise<void>;
  /** Drop a failed entry and load again. */
  retryNode(id: string): Promise<void>;
  /** Emit a camera command (adds the nonce). */
  emitCamera(intent: CameraIntent): void;
  /** Force a snapshot refresh now. */
  refresh(): Promise<void>;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function initialReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

let poller: Poller | null = null;
let nonce = 0;

export const useGalaxy = create<GalaxyState>()((set, get) => {
  function applySnapshot(next: Snapshot) {
    const { selectedId, hoveredId } = get();
    const ids = new Set(next.nodes.map((node) => node.id));
    set({
      view: next,
      loadState: "ready",
      error: null,
      selectedId: selectedId && ids.has(selectedId) ? selectedId : null,
      hoveredId: hoveredId && ids.has(hoveredId) ? hoveredId : null,
    });
    const selected = get().selectedId;
    if (selected) void get().loadNode(selected);
  }

  function setDetail(id: string, entry: NodeDetailEntry) {
    set((state) => ({ nodeDetails: { ...state.nodeDetails, [id]: entry } }));
  }

  return {
    studyId: null,
    prefix: null,
    view: null,
    loadState: "loading",
    error: null,
    selectedId: null,
    hoveredId: null,
    lens: false,
    quality: "auto",
    effectiveQuality: "high",
    reducedMotion: initialReducedMotion(),
    nodeDetails: {},
    reportOpen: false,
    cameraCommand: null,

    startStudy(studyId, prefix) {
      poller?.stop();
      set({
        studyId,
        prefix,
        view: null,
        loadState: "loading",
        error: null,
        selectedId: null,
        hoveredId: null,
        nodeDetails: {},
        reportOpen: false,
        cameraCommand: null,
      });
      const own = createPoller({
        prefix,
        onSnapshot: applySnapshot,
        onError: (error) => {
          if (get().view) {
            // Keep the last view on screen; the HUD shows a retry toast from `error`.
            set({ error: error instanceof HttpError && error.message ? error.message : REFRESH_FAILED });
            return;
          }
          const message = error instanceof HttpError && error.message ? error.message : FIRST_LOAD_FAILED;
          set({ loadState: "error", error: message });
        },
        onSuccess: () => {
          if (get().view && get().error) set({ error: null });
        },
      });
      poller = own;
      own.start();
      return () => {
        own.stop();
        if (poller === own) poller = null;
      };
    },

    select(id) {
      if (id === null) {
        set({ selectedId: null });
        return;
      }
      set({ selectedId: id });
      get().emitCamera({ kind: "focus", id });
      void get().loadNode(id);
    },

    hover(id) {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },

    toggleLens() {
      set((state) => ({ lens: !state.lens }));
    },

    setQuality(quality) {
      set({ quality, effectiveQuality: quality === "auto" ? "high" : quality });
    },

    setAutoTier(tier) {
      if (get().quality === "auto" && get().effectiveQuality !== tier) set({ effectiveQuality: tier });
    },

    openReport() {
      set({ reportOpen: true });
    },

    closeReport() {
      set({ reportOpen: false });
    },

    async loadNode(id) {
      const node = findNode(get().view, id);
      if (!node || node.goal) return;
      const revision = node.steps_revision ?? "";
      if (!node.step_count) {
        setDetail(id, { revision, steps: [], state: "ready" });
        return;
      }
      const cached = get().nodeDetails[id];
      if (cached && cached.revision === revision && cached.state !== "error") return;
      if (!poller) return;
      // Keep showing the previous steps while a newer revision loads.
      setDetail(id, { revision, steps: cached?.steps ?? [], state: "loading" });
      try {
        const result = await poller.fetchNode(id);
        if (result.kind === "ready") {
          setDetail(id, { revision: result.detail.steps_revision ?? revision, steps: result.detail.steps || [], state: "ready" });
        } else {
          setDetail(id, { revision, steps: get().nodeDetails[id]?.steps ?? [], state: "error" });
        }
      } catch {
        const current = get().nodeDetails[id];
        if (current && current.revision === revision) setDetail(id, { ...current, state: "error" });
      }
    },

    async retryNode(id) {
      set((state) => {
        const rest = { ...state.nodeDetails };
        delete rest[id];
        return { nodeDetails: rest };
      });
      await get().loadNode(id);
    },

    emitCamera(intent) {
      nonce += 1;
      set({ cameraCommand: { ...intent, nonce } });
    },

    async refresh() {
      await poller?.refresh({ force: true });
    },
  };
});

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", (event) => useGalaxy.setState({ reducedMotion: event.matches }));
}

// ---------------------------------------------------------------------------
// Selectors

export function findNode(view: Snapshot | null, id: string | null): ViewNode | null {
  if (!view || id === null) return null;
  return view.nodes.find((node) => node.id === id) ?? null;
}

export function useSelectedNode(): ViewNode | null {
  return useGalaxy((state) => findNode(state.view, state.selectedId));
}

export function useNodeDetail(id: string | null): NodeDetailEntry | null {
  return useGalaxy((state) => (id === null ? null : (state.nodeDetails[id] ?? null)));
}
