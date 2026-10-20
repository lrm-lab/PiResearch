// Animated per-node / per-edge state shared by every shader through two small
// float textures, plus the scene clock. One instance per canvas; FxDriver
// syncs it with the graph and advances it once per frame.

import { DataTexture, FloatType, NearestFilter, RGBAFormat, Vector2 } from "three";
import type { SceneGraph, SceneNode } from "./graph";
import { MAX_SATELLITES } from "./orbits";

export type FxEventKind = "born" | "status" | "steps";

export interface FxEvent {
  kind: FxEventKind;
  node: SceneNode;
  /** Scene time the effect starts (may be in the future). */
  at: number;
}

interface NodeState {
  emph: number;
  target: number;
  hover: number;
  hoverTarget: number;
  bornAt: number;
  /** Births after the first snapshot flash; first-load nodes only grow in. */
  bornFlash: boolean;
  flashAt: number;
  burstFrom: number;
  burstTo: number;
  burstAt: number;
}

interface Known {
  status: string;
  steps: number;
}

const NODE_ROWS = 2;
const BIRTH = 0.9;
const LONG_AGO = -1e4;

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function capacity(n: number): number {
  let cap = 64;
  while (cap < n) cap *= 2;
  return cap;
}

function makeTexture(width: number, height: number): { data: Float32Array; tex: DataTexture } {
  const data = new Float32Array(width * height * 4);
  const tex = new DataTexture(data, width, height, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { data, tex };
}

export class SceneFx {
  /** Seconds of scene time. Frozen while reduced motion is on. */
  time = 0;
  reduced = false;
  /** 0..1, eased toward "any live call". Drives the core / bloom pulse. */
  live = 0;
  liveTarget = 0;
  /** 0..1, eased toward "goal is planning or finalising" (the core ring). */
  activity = 0;
  activityTarget = 0;
  /** 0.3..1: core glare gain, lowered as the camera nears the core (CoreStar sets it). */
  glare = 1;
  /** Camera distance of the current overview fit (CameraRig sets it; 0 until known). */
  overviewDistance = 0;

  readonly uniforms = {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uDpr: { value: 1 },
    /** Drawing buffer size in physical pixels. */
    uViewport: { value: new Vector2(1, 1) },
    uNodeTex: { value: null as unknown as DataTexture },
    uEdgeTex: { value: null as unknown as DataTexture },
  };

  private nodeCap = 0;
  private nodeData: Float32Array = new Float32Array(0);
  private nodeTex: DataTexture | null = null;
  private edgeCap = 0;
  private edgeData: Float32Array = new Float32Array(0);
  private edgeTex: DataTexture | null = null;

  private graph: SceneGraph | null = null;
  private states = new Map<string, NodeState>();
  private edgeCur = new Map<string, number>();
  private nodeTarget: Float32Array = new Float32Array(0);
  private edgeTarget: Float32Array = new Float32Array(0);
  private hoveredId: string | null = null;
  private known: Map<string, Known> | null = null;
  private listeners = new Set<(event: FxEvent) => void>();

  constructor() {
    this.ensureNodes(1);
    this.ensureEdges(1);
  }

  on(listener: (event: FxEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Diff a new graph against the last one: births, status flashes, step bursts. */
  sync(graph: SceneGraph): void {
    const first = this.known === null || this.known.size === 0;
    const next = new Map<string, Known>();
    const events: FxEvent[] = [];
    for (const node of graph.nodes) {
      const steps = Math.min(node.node.step_count ?? 0, MAX_SATELLITES);
      const status = node.node.status;
      next.set(node.id, { status, steps });
      let state = this.states.get(node.id);
      if (!state) {
        // First load: a quick staggered grow-in from the core outward, no flashes.
        const delay = first ? 0.25 + 1.1 * Math.min(1, Math.hypot(node.p.x, node.p.z) / graph.extent) : 0;
        state = {
          emph: 1,
          target: 1,
          hover: 0,
          hoverTarget: 0,
          bornAt: this.reduced ? LONG_AGO : this.time + delay,
          bornFlash: !first,
          flashAt: LONG_AGO,
          burstFrom: 0,
          burstTo: 0,
          burstAt: LONG_AGO,
        };
        this.states.set(node.id, state);
        if (!first && !this.reduced) events.push({ kind: "born", node, at: state.bornAt });
        continue;
      }
      const prev = this.known?.get(node.id);
      if (!prev || this.reduced) continue;
      if (prev.status !== status) {
        state.flashAt = this.time;
        events.push({ kind: "status", node, at: this.time });
      }
      if (steps > prev.steps) {
        state.burstFrom = prev.steps;
        state.burstTo = steps;
        state.burstAt = this.time;
        events.push({ kind: "steps", node, at: this.time });
      }
    }
    for (const id of [...this.states.keys()]) if (!next.has(id)) this.states.delete(id);
    const keys = new Set(graph.edges.map((edge) => edge.key));
    for (const key of [...this.edgeCur.keys()]) if (!keys.has(key)) this.edgeCur.delete(key);
    this.known = next;
    this.graph = graph;
    if (this.nodeTarget.length !== graph.nodes.length) this.nodeTarget = new Float32Array(graph.nodes.length).fill(1);
    if (this.edgeTarget.length !== graph.edges.length) this.edgeTarget = new Float32Array(graph.edges.length).fill(1);
    this.ensureNodes(graph.nodes.length);
    this.ensureEdges(graph.edges.length);
    for (const event of events) for (const listener of this.listeners) listener(event);
  }

  setTargets(nodes: Float32Array, edges: Float32Array, hoveredId: string | null): void {
    this.nodeTarget = nodes;
    this.edgeTarget = edges;
    this.hoveredId = hoveredId;
  }

  /** Current animated emphasis of a node (labels read this). */
  emphasis(id: string): number {
    return this.states.get(id)?.emph ?? 1;
  }

  /** Current birth scale of a node, 0..~1.1. */
  scale(id: string): number {
    const state = this.states.get(id);
    return state ? this.birthScale(state) : 1;
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    if (!this.reduced) this.time += step;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uMotion.value = this.reduced ? 0 : 1;
    const k = this.reduced ? 1 : 1 - Math.exp(-step * 9);
    this.live += (this.liveTarget - this.live) * (this.reduced ? 1 : 1 - Math.exp(-step * 2.5));
    this.activity += (this.activityTarget - this.activity) * (this.reduced ? 1 : 1 - Math.exp(-step * 2));

    const graph = this.graph;
    if (!graph) return;
    const data = this.nodeData;
    const row = this.nodeCap * 4;
    for (const node of graph.nodes) {
      const state = this.states.get(node.id);
      if (!state) continue;
      state.target = this.nodeTarget[node.i] ?? 1;
      state.hoverTarget = node.id === this.hoveredId ? 1 : 0;
      state.emph += (state.target - state.emph) * k;
      state.hover += (state.hoverTarget - state.hover) * k;
      const o = node.i * 4;
      data[o] = state.emph;
      data[o + 1] = this.birthScale(state);
      data[o + 2] = this.flash(state);
      data[o + 3] = state.hover;
      data[row + o] = state.burstFrom;
      data[row + o + 1] = state.burstTo;
      data[row + o + 2] = state.burstAt;
      data[row + o + 3] = 0;
    }
    if (this.nodeTex) this.nodeTex.needsUpdate = true;

    const edges = this.edgeData;
    for (const edge of graph.edges) {
      const target = this.edgeTarget[edge.i] ?? 1;
      const cur = this.edgeCur.get(edge.key) ?? target;
      const value = cur + (target - cur) * k;
      this.edgeCur.set(edge.key, value);
      edges[edge.i * 4] = value;
    }
    if (this.edgeTex) this.edgeTex.needsUpdate = true;
  }

  dispose(): void {
    this.nodeTex?.dispose();
    this.edgeTex?.dispose();
    this.listeners.clear();
  }

  private birthScale(state: NodeState): number {
    const age = this.time - state.bornAt;
    if (age <= 0) return 0;
    if (age >= BIRTH) return 1;
    return Math.max(0, easeOutBack(age / BIRTH));
  }

  private flash(state: NodeState): number {
    const pulse = (at: number) => {
      const age = this.time - at;
      return age < 0 || age > 2.5 ? 0 : Math.exp(-age * 3.2);
    };
    return Math.max(state.bornFlash ? pulse(state.bornAt) : 0, pulse(state.flashAt));
  }

  private ensureNodes(n: number): void {
    const cap = capacity(n);
    if (cap <= this.nodeCap) return;
    this.nodeTex?.dispose();
    const { data, tex } = makeTexture(cap, NODE_ROWS);
    this.nodeCap = cap;
    this.nodeData = data;
    this.nodeTex = tex;
    this.uniforms.uNodeTex.value = tex;
  }

  private ensureEdges(n: number): void {
    const cap = capacity(n);
    if (cap <= this.edgeCap) return;
    this.edgeTex?.dispose();
    const { data, tex } = makeTexture(cap, 1);
    this.edgeCap = cap;
    this.edgeData = data;
    this.edgeTex = tex;
    this.uniforms.uEdgeTex.value = tex;
  }
}
