// A real <button> per body (drei Html), in id order so Tab follows creation
// order. Scale and opacity follow camera distance (clamped), and far labels
// fade, except the goal and the selected / hovered one. No `occlude`: it
// flickers with the EffectComposer. Every Html renders into `portal`.
//
// Screen-space declutter (every DECLUTTER_MS): labels are placed greedily by
// priority (goal > selected > hovered / focused > in progress or error > hub >
// the rest); one that overlaps an already placed label fades out and stops
// taking pointer events, but stays in the DOM, in Tab order, and shows again
// as soon as it is focused or the camera zooms in far enough to make room.

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { type Camera, Group, MathUtils, Vector3 } from "three";
import { ariaLabel } from "../lib/activity";
import { compareNodes } from "../lib/order";
import { CANCELLED_GREY, ERROR_RED, TONE_COLOR } from "../lib/palette";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import type { SceneGraph, SceneNode } from "./graph";
import { ensureLabelStyles } from "./labelStyles";
import { orbitPosition } from "./orbits";
import { COMET_FADE, type Comet } from "./useComets";

const point = new Vector3();
const projected = new Vector3();

const DECLUTTER_MS = 120;
/** Gap (px) kept between placed labels. */
const LABEL_GAP = 3;

function priority(node: SceneNode, selected: string | null, hot: boolean): number {
  if (node.node.goal) return 6;
  if (node.id === selected) return 5;
  if (hot) return 4;
  if (node.err || node.node.status === "in_progress") return 3;
  if (node.node.weight === "hub") return 2;
  return 1;
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.l < b.r + LABEL_GAP && b.l < a.r + LABEL_GAP && a.t < b.b + LABEL_GAP && b.t < a.b + LABEL_GAP;
}

function dotStatus(node: SceneNode): string {
  if (node.err) return "error";
  return node.node.status || "resolved";
}

function dotColor(node: SceneNode): string {
  if (node.err) return ERROR_RED;
  if (node.node.status === "cancelled") return CANCELLED_GREY;
  if (node.node.status === "open") return TONE_COLOR.pending;
  return node.tone;
}

interface Applied {
  s: number;
  o: number;
  hot: boolean;
}

/** Per-label declutter state between ticks. */
interface Slot {
  /** Placed by the last declutter pass. */
  show: boolean;
  /** Eased 0..1 visibility multiplied into the opacity. */
  vis: number;
  /** Opacity / scale before declutter, from the last frame. */
  base: number;
  scale: number;
}

export function Labels({ graph, fx, portal }: { graph: SceneGraph; fx: SceneFx; portal: RefObject<HTMLElement> }) {
  const view = useGalaxy((state) => state.view);
  const selectedId = useGalaxy((state) => state.selectedId);
  const select = useGalaxy((state) => state.select);
  const hover = useGalaxy((state) => state.hover);
  // Leaving one label must not clear a hover another label (or a body) already took.
  const unhover = useGalaxy((state) => state.unhover);
  const sorted = useMemo(() => [...graph.nodes].sort((a, b) => compareNodes(a.node, b.node)), [graph]);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const applied = useRef(new Map<string, Applied>());
  const slots = useRef(new Map<string, Slot>());
  /** Untransformed label sizes (offsetWidth / offsetHeight), kept current by a ResizeObserver. */
  const sizes = useRef(new WeakMap<HTMLButtonElement, { width: number; height: number }>());
  const observed = useRef(new Set<HTMLButtonElement>());
  const sizeObserver = useRef<ResizeObserver | null>(null);

  function observe(el: HTMLButtonElement) {
    const observer = sizeObserver.current;
    if (!observer || observed.current.has(el)) return;
    observed.current.add(el);
    observer.observe(el);
  }

  /** Label size without a layout read per pass (one direct read until the observer reports). */
  function labelSize(el: HTMLButtonElement): { width: number; height: number } {
    let size = sizes.current.get(el);
    if (!size) {
      size = { width: el.offsetWidth, height: el.offsetHeight };
      if (observed.current.has(el)) sizes.current.set(el, size);
    }
    return size;
  }

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    sizeObserver.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLButtonElement;
        sizes.current.set(el, { width: el.offsetWidth, height: el.offsetHeight });
      }
    });
    for (const el of buttons.current.values()) observe(el);
    return () => {
      sizeObserver.current?.disconnect();
      sizeObserver.current = null;
      observed.current.clear();
      sizes.current = new WeakMap();
    };
  }, []);
  const lastDeclutter = useRef(-Infinity);
  const reorder = useRef(true);

  useEffect(() => ensureLabelStyles(), []);
  useEffect(() => {
    reorder.current = true;
    // Stop observing labels whose node left the graph.
    const live = new Set(buttons.current.values());
    for (const el of observed.current) {
      if (live.has(el)) continue;
      sizeObserver.current?.unobserve(el);
      observed.current.delete(el);
    }
  }, [sorted]);

  /** Greedy placement in priority order; losers fade (see header). */
  function declutter(camera: Camera, width: number, height: number, selected: string | null, hovered: string | null) {
    const focused = document.activeElement;
    const entries: { node: SceneNode; rank: number; order: number; rect: Rect; forced: boolean }[] = [];
    sorted.forEach((node, order) => {
      const el = buttons.current.get(node.id);
      const slot = slots.current.get(node.id);
      if (!el || !slot) return;
      const hot = node.id === hovered || el === focused;
      const forced = node.node.goal || node.id === selected || hot;
      if (slot.base < 0.12 && !forced) {
        slot.show = true;
        return;
      }
      projected.set(node.p.x, node.p.y + node.lift, node.p.z).project(camera);
      if (projected.z > 1 || projected.z < -1) {
        slot.show = forced;
        return;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (0.5 - projected.y * 0.5) * height;
      const size = labelSize(el);
      const w = size.width * slot.scale;
      const h = size.height * slot.scale;
      const rect = { l: x - w / 2, r: x + w / 2, t: y - 4 - h, b: y - 4 };
      if (rect.r < 0 || rect.l > width || rect.b < 0 || rect.t > height) {
        slot.show = true;
        return;
      }
      entries.push({ node, rank: priority(node, selected, hot), order, rect, forced });
    });
    // Priority first, then bigger bodies (more tool calls), then id order: stable, so no flicker.
    entries.sort((a, b) => b.rank - a.rank || b.node.p.r - a.node.p.r || a.order - b.order);
    const placed: Rect[] = [];
    for (const entry of entries) {
      const slot = slots.current.get(entry.node.id);
      if (!slot) continue;
      const free = entry.forced || !placed.some((rect) => overlaps(rect, entry.rect));
      slot.show = free;
      if (free) placed.push(entry.rect);
    }
  }

  useFrame(({ camera, size }, delta) => {
    const { selectedId: selected, hoveredId: hovered } = useGalaxy.getState();
    const now = performance.now();
    if (now - lastDeclutter.current >= DECLUTTER_MS) {
      lastDeclutter.current = now;
      declutter(camera, size.width, size.height, selected, hovered);
    }
    const focused = document.activeElement;
    const ease = fx.reduced ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 11);
    // Far fade starts past the overview distance (the overview fit sets it).
    const far = fx.overviewDistance > 0 ? fx.overviewDistance * 1.25 : graph.extent * 2.3;
    for (const node of sorted) {
      const el = buttons.current.get(node.id);
      if (!el) continue;
      point.set(node.p.x, node.p.y, node.p.z);
      const dist = camera.position.distanceTo(point);
      const hot = node.id === hovered;
      const important = node.node.goal || node.id === selected || hot;
      let s = Math.min(1.1, Math.max(0.74, Math.sqrt(12 / Math.max(dist, 0.01))));
      let o = 1;
      if (important) {
        s = Math.max(s, 0.94) * (hot ? 1.12 : 1);
      } else {
        o = 1 - 0.8 * MathUtils.smoothstep(dist, far, far * 1.6);
        const emph = fx.emphasis(node.id);
        o *= Math.min(1, Math.max(0.2, (emph - 0.15) / 0.75));
      }
      o *= Math.min(1, fx.scale(node.id));
      if (dist < node.p.r * 2.2) o = 0;
      let slot = slots.current.get(node.id);
      if (!slot) {
        slot = { show: true, vis: 1, base: o, scale: s };
        slots.current.set(node.id, slot);
      }
      slot.base = o;
      slot.scale = s;
      // A focused (Tab) label always shows, without waiting for the next pass.
      const show = slot.show || el === focused || important;
      slot.vis += ((show ? 1 : 0) - slot.vis) * ease;
      if (Math.abs(slot.vis - (show ? 1 : 0)) < 0.004) slot.vis = show ? 1 : 0;
      o *= slot.vis;
      const prev = applied.current.get(node.id);
      if (prev && Math.abs(prev.s - s) < 0.004 && Math.abs(prev.o - o) < 0.008 && prev.hot === hot) continue;
      applied.current.set(node.id, { s, o, hot });
      el.style.transform = `translate(-50%, calc(-100% - 4px)) scale(${s.toFixed(3)})`;
      el.style.opacity = o.toFixed(3);
      el.style.pointerEvents = o < 0.12 ? "none" : "auto";
      el.dataset.hot = hot ? "1" : "0";
    }
    // Keep DOM order = id order (Html appends on mount, so late nodes land last).
    const layer = portal.current;
    if (reorder.current && layer) {
      const roots: HTMLElement[] = [];
      for (const node of sorted) {
        let el: HTMLElement | null = buttons.current.get(node.id) ?? null;
        while (el && el.parentElement !== layer) el = el.parentElement;
        if (!el) return;
        roots.push(el);
      }
      const current = [...layer.children].filter((child) => roots.includes(child as HTMLElement));
      if (current.some((child, i) => child !== roots[i])) for (const root of roots) layer.appendChild(root);
      reorder.current = false;
    }
  });

  return (
    <>
      {sorted.map((node) => {
        const isSelected = node.id === selectedId;
        return (
          <Html
            key={node.id}
            position={[node.p.x, node.p.y + node.lift, node.p.z]}
            portal={portal}
            zIndexRange={[100, 0]}
            style={{ pointerEvents: "none" }}
          >
            <button
              ref={(el) => {
                if (el) {
                  buttons.current.set(node.id, el);
                  observe(el);
                } else {
                  buttons.current.delete(node.id);
                  applied.current.delete(node.id);
                  slots.current.delete(node.id);
                }
              }}
              type="button"
              data-id={node.id}
              aria-label={ariaLabel(view, node.node)}
              aria-pressed={isSelected}
              className={node.node.goal ? "gx-label gx-goal" : "gx-label"}
              style={{ "--gx-tone": node.tone, "--gx-dot": dotColor(node), opacity: 0 } as CSSProperties}
              onClick={(event) => {
                event.stopPropagation();
                select(node.id);
              }}
              onPointerEnter={() => hover(node.id)}
              onPointerLeave={() => unhover(node.id)}
              onFocus={() => hover(node.id)}
              onBlur={() => unhover(node.id)}
            >
              {!node.node.goal && <span className="gx-dot" data-status={dotStatus(node)} aria-hidden="true" />}
              <span className="gx-id" aria-hidden="true">
                {node.node.goal ? "Q" : node.id.toUpperCase()}
              </span>
              <span className="gx-title" aria-hidden="true">
                {node.node.title}
              </span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

/** Small chips riding next to live-call comets (no chip for 【思考】). */
export function CometChips({ comets, fx, portal }: { comets: Comet[]; fx: SceneFx; portal: RefObject<HTMLElement> }) {
  const shown = useMemo(() => comets.filter((comet) => !comet.thinking), [comets]);
  const groups = useRef(new Map<string, Group>());
  const chips = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => ensureLabelStyles(), []);

  useFrame(({ camera }) => {
    const t = fx.time;
    for (const comet of shown) {
      const group = groups.current.get(comet.key);
      const chip = chips.current.get(comet.key);
      if (!group || !chip) continue;
      const scale = comet.nodeIndex < 0 ? 1 : fx.scale(comet.nodeId);
      const orbit = scale === 1 ? comet.orbit : { ...comet.orbit, radius: comet.orbit.radius * scale };
      orbitPosition(orbit, comet.center, t, group.position);
      group.position.y += 0.06;
      const dist = camera.position.distanceTo(group.position);
      const fadeOut = Number.isFinite(comet.dieAt) ? 1 - MathUtils.smoothstep(t, comet.dieAt, comet.dieAt + COMET_FADE) : 1;
      const life = fx.reduced ? 1 : MathUtils.smoothstep(t, comet.bornAt, comet.bornAt + 0.6) * fadeOut;
      const emph = comet.nodeIndex < 0 ? 1 : fx.emphasis(comet.nodeId);
      const far = 1 - MathUtils.smoothstep(dist, 18, 34);
      const s = Math.min(1.05, Math.max(0.7, Math.sqrt(8 / Math.max(dist, 0.01))));
      chip.style.opacity = (life * far * Math.min(1, Math.max(0.15, (emph - 0.2) / 0.7))).toFixed(3);
      chip.style.transform = `translate(10px, -50%) scale(${s.toFixed(3)})`;
    }
  });

  return (
    <>
      {shown.map((comet) => (
        <group
          key={comet.key}
          ref={(group) => {
            if (group) groups.current.set(comet.key, group);
            else groups.current.delete(comet.key);
          }}
        >
          <Html portal={portal} zIndexRange={[120, 101]} style={{ pointerEvents: "none" }}>
            <span
              ref={(el) => {
                if (el) chips.current.set(comet.key, el);
                else chips.current.delete(comet.key);
              }}
              className="gx-chip"
              aria-hidden="true"
              style={{ "--gx-tone": comet.tone, opacity: 0 } as CSSProperties}
            >
              {comet.label}
            </span>
          </Html>
        </group>
      ))}
    </>
  );
}
