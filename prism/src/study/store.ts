// Study-page state shared by the 3D scene (src/scene/**) and the page chrome (src/study/**).
// Data loading lives here; components only read state and call actions.

import { create } from "zustand";
import { createPoller, HttpError, isMissingStudy, studyApiPrefix, type Poller } from "../lib/api";
import { REDUCED_MOTION_QUERY } from "../lib/media";
import type { Snapshot, Step, ViewNode } from "../types/api";

export type LoadState = "loading" | "ready" | "error";
/** Why the first load failed: the study does not exist (404), or anything else (still retrying). */
export type LoadErrorKind = "missing" | "retry";
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
  /** Fly to the goal prism (key F, 回到主问题). */
  | { kind: "core" }
  /** Zoom one step in (+1) or out (-1) around the current target (toolbar buttons). */
  | { kind: "zoom"; step: 1 | -1 };

export type CameraCommand = CameraIntent & { nonce: number };

/** The page's three views (header tabs): 3D task map, task list, report. */
export type StudyView = "map" | "tasks" | "report";

export const FIRST_LOAD_FAILED = "研究服务没有返回数据，正在重试。";
export const REFRESH_FAILED = "连接中断";

/** The camera flight into the goal prism (key F). */
export const CORE_DIVE_MS = 900;

export interface StudyState {
  /** Study id from the URL, e.g. "sessions/20261020-101500/1". */
  studyId: string | null;
  /** Last applied snapshot. */
  view: Snapshot | null;
  loadState: LoadState;
  /** Message for loadState "error" (or a failed refresh while a view is shown). */
  error: string | null;
  /** Set with loadState "error". */
  errorKind: LoadErrorKind | null;
  selectedId: string | null;
  hoveredId: string | null;
  /** 核验透镜 (verification lens): dims everything but verification relations and their tasks. */
  lens: boolean;
  /** Current header tab. */
  tab: StudyView;
  /** Agents hidden by the toolbar filter (empty = all shown). */
  hiddenAgents: Record<string, true>;
  quality: Quality;
  /** What the scene renders. With quality "auto" the scene's monitor sets it. */
  effectiveQuality: QualityTier;
  /** Live `prefers-reduced-motion`. */
  reducedMotion: boolean;
  /** Lazily loaded steps by node id. */
  nodeDetails: Record<string, NodeDetailEntry>;
  cameraCommand: CameraCommand | null;

  /** Start polling a study. Returns the cleanup (stops the poller). */
  startStudy(studyId: string): () => void;
  /** Select a node (flies the camera to it and loads its steps) or clear with null. */
  select(id: string | null): void;
  hover(id: string | null): void;
  /** Clear the hover only if `id` still holds it (another label or body may already have taken it). */
  unhover(id: string): void;
  toggleLens(): void;
  setTab(tab: StudyView): void;
  toggleAgent(agent: string): void;
  showAllAgents(): void;
  setQuality(quality: Quality): void;
  /** Used by the scene's frame-time monitor; ignored unless quality is "auto". */
  setAutoTier(tier: QualityTier): void;
  /** Fetch a node's steps if they are not cached for its current steps_revision. */
  loadNode(id: string): Promise<void>;
  /** Drop a failed entry and load again. */
  retryNode(id: string): Promise<void>;
  /** Emit a camera command (adds the nonce). */
  emitCamera(intent: CameraIntent): void;
}

function initialReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

let poller: Poller | null = null;
let nonce = 0;

export const useStudy = create<StudyState>()((set, get) => {
  function applySnapshot(next: Snapshot) {
    const { selectedId, hoveredId } = get();
    const { byId } = nodeIndex(next);
    set({
      view: next,
      loadState: "ready",
      error: null,
      errorKind: null,
      selectedId: selectedId && byId.has(selectedId) ? selectedId : null,
      hoveredId: hoveredId && byId.has(hoveredId) ? hoveredId : null,
    });
    const selected = get().selectedId;
    if (selected) void get().loadNode(selected);
  }

  function setDetail(id: string, entry: NodeDetailEntry) {
    set((state) => ({ nodeDetails: { ...state.nodeDetails, [id]: entry } }));
  }

  return {
    studyId: null,
    view: null,
    loadState: "loading",
    error: null,
    errorKind: null,
    selectedId: null,
    hoveredId: null,
    lens: false,
    tab: "map",
    hiddenAgents: {},
    quality: "auto",
    effectiveQuality: "high",
    reducedMotion: initialReducedMotion(),
    nodeDetails: {},
    cameraCommand: null,

    startStudy(studyId) {
      poller?.stop();
      set({
        studyId,
        view: null,
        loadState: "loading",
        error: null,
        errorKind: null,
        selectedId: null,
        hoveredId: null,
        nodeDetails: {},
        cameraCommand: null,
        hiddenAgents: {},
      });
      const own = createPoller({
        prefix: studyApiPrefix(studyId),
        onSnapshot: applySnapshot,
        onError: (error) => {
          if (get().view) {
            // Keep the last view on screen; the HUD shows a retry toast from `error`.
            set({ error: error instanceof HttpError && error.message ? error.message : REFRESH_FAILED });
            return;
          }
          const message = error instanceof HttpError && error.message ? error.message : FIRST_LOAD_FAILED;
          set({ loadState: "error", error: message, errorKind: isMissingStudy(error) ? "missing" : "retry" });
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

    unhover(id) {
      if (get().hoveredId === id) set({ hoveredId: null });
    },

    toggleLens() {
      set((state) => ({ lens: !state.lens }));
    },

    setTab(tab) {
      if (get().tab !== tab) set({ tab });
    },

    toggleAgent(agent) {
      set((state) => {
        const hiddenAgents = { ...state.hiddenAgents };
        if (hiddenAgents[agent]) delete hiddenAgents[agent];
        else hiddenAgents[agent] = true;
        return { hiddenAgents };
      });
    },

    showAllAgents() {
      set({ hiddenAgents: {} });
    },

    setQuality(quality) {
      set({ quality, effectiveQuality: quality === "auto" ? "high" : quality });
    },

    setAutoTier(tier) {
      if (get().quality === "auto" && get().effectiveQuality !== tier) set({ effectiveQuality: tier });
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
  };
});

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", (event) => useStudy.setState({ reducedMotion: event.matches }));
}

// ---------------------------------------------------------------------------
// Selectors

interface NodeIndex {
  byId: Map<string, ViewNode>;
  /** The first node flagged `goal`. */
  goal: ViewNode | null;
}

/** Built once per snapshot object (snapshots are replaced, never mutated). */
const indexes = new WeakMap<Snapshot, NodeIndex>();

function nodeIndex(view: Snapshot): NodeIndex {
  let index = indexes.get(view);
  if (!index) {
    const byId = new Map<string, ViewNode>();
    // First occurrence wins, like Array.find.
    for (const node of view.nodes) if (!byId.has(node.id)) byId.set(node.id, node);
    index = { byId, goal: view.nodes.find((node) => node.goal) ?? null };
    indexes.set(view, index);
  }
  return index;
}

export function findNode(view: Snapshot | null, id: string | null): ViewNode | null {
  if (!view || id === null) return null;
  return nodeIndex(view).byId.get(id) ?? null;
}

/** The goal node of a snapshot, or null. */
export function findGoal(view: Snapshot | null): ViewNode | null {
  return view ? nodeIndex(view).goal : null;
}

export function useSelectedNode(): ViewNode | null {
  return useStudy((state) => findNode(state.view, state.selectedId));
}

export function useNodeDetail(id: string | null): NodeDetailEntry | null {
  return useStudy((state) => (id === null ? null : (state.nodeDetails[id] ?? null)));
}
