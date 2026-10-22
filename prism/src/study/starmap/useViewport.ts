// Pan / zoom controller for the star map: drag, wheel, pinch, momentum, tweened camera moves, and
// the fit transform. State is a Transform (see transform.ts); gestures are pointer events on `el`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clamp,
  clampPan,
  easeOutCubic,
  fitTransform,
  lerpTransform,
  zoomAt,
  zoomLimits,
  type Bounds,
  type Point,
  type Size,
  type Transform,
} from "./transform";

const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

export interface ViewportApi {
  size: Size;
  t: Transform;
  fit: Transform | null;
  /** The map has been dragged, zoomed or flown by the visitor (so resizes keep the camera). */
  moving: boolean;
  zoomBy(factor: number): void;
  fitView(): void;
  /** Fly so world point `p` sits in the middle of the free area, optionally at scale `k`. */
  flyTo(t: Transform): void;
  setEl(el: HTMLElement | null): void;
}

export function useViewport(bounds: Bounds | null, reduced: boolean): ViewportApi {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [t, setT] = useState<Transform>(IDENTITY);
  const [moving, setMoving] = useState(false);

  const tRef = useRef(t);
  const sizeRef = useRef(size);
  const boundsRef = useRef(bounds);
  const limitsRef = useRef(zoomLimits(0.1));
  const interacted = useRef(false);
  const raf = useRef(0);
  const tween = useRef(0);
  const pending = useRef<Transform | null>(null);
  boundsRef.current = bounds;
  sizeRef.current = size;

  const fit = useMemo(() => {
    if (!bounds || size.w < 10 || size.h < 10) return null;
    const small = size.w < 640;
    const pad = small ? { top: 28, right: 20, bottom: 56, left: 20 } : { top: 56, right: 64, bottom: 72, left: 64 };
    return fitTransform(bounds, size, pad);
  }, [bounds, size]);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  if (fit) limitsRef.current = zoomLimits(fit.k);

  const commit = useCallback((next: Transform) => {
    const b = boundsRef.current;
    const clamped = b ? clampPan({ ...next, k: clamp(next.k, limitsRef.current.min, limitsRef.current.max) }, b, sizeRef.current) : next;
    tRef.current = clamped;
    pending.current = clamped;
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        if (pending.current) setT(pending.current);
        pending.current = null;
      });
    }
  }, []);

  const stopTween = useCallback(() => {
    if (tween.current) cancelAnimationFrame(tween.current);
    tween.current = 0;
  }, []);

  const flyTo = useCallback(
    (target: Transform, ms = 520) => {
      stopTween();
      if (reduced || ms <= 0) return commit(target);
      const from = tRef.current;
      const start = performance.now();
      const step = (now: number) => {
        const f = clamp((now - start) / ms, 0, 1);
        commit(lerpTransform(from, target, easeOutCubic(f)));
        tween.current = f < 1 ? requestAnimationFrame(step) : 0;
      };
      tween.current = requestAnimationFrame(step);
    },
    [commit, reduced, stopTween],
  );

  // Size of the viewport.
  useEffect(() => {
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  // Follow the fit until the visitor takes the camera; afterwards only keep the map reachable.
  useEffect(() => {
    if (!fit) return;
    if (!interacted.current) commit(fit);
    else commit(tRef.current);
  }, [fit, commit]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    stopTween();
  }, [stopTween]);

  // Gestures.
  useEffect(() => {
    if (!el) return;
    const pointers = new Map<number, Point>();
    let drag: { id: number; startX: number; startY: number; engaged: boolean } | null = null;
    let pinch: { dist: number; cx: number; cy: number } | null = null;
    let suppressClick = false;
    let samples: { t: number; x: number; y: number }[] = [];
    let momentum = 0;

    const rect = () => el.getBoundingClientRect();
    const touch = () => {
      interacted.current = true;
      setMoving(true);
      stopTween();
      cancelAnimationFrame(momentum);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if ((event.target as Element).closest("[data-ui]")) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      cancelAnimationFrame(momentum);
      if (pointers.size === 1) {
        drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, engaged: false };
        samples = [];
        suppressClick = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        suppressClick = true;
      }
    };

    const onMove = (event: PointerEvent) => {
      const prev = pointers.get(event.pointerId);
      if (!prev) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        touch();
        const r = rect();
        const cur = tRef.current;
        let next = zoomAt(cur, cur.k * (dist / pinch.dist), cx - r.left, cy - r.top, limitsRef.current);
        next = { ...next, x: next.x + (cx - pinch.cx), y: next.y + (cy - pinch.cy) };
        commit(next);
        pinch = { dist, cx, cy };
        return;
      }
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.engaged) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        drag.engaged = true;
        suppressClick = true;
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          /* pointer already gone */
        }
        el.dataset.panning = "1";
      }
      touch();
      const now = performance.now();
      samples.push({ t: now, x: event.clientX, y: event.clientY });
      samples = samples.filter((s) => now - s.t < 120);
      const cur = tRef.current;
      commit({ ...cur, x: cur.x + (event.clientX - prev.x), y: cur.y + (event.clientY - prev.y) });
    };

    const onUp = (event: PointerEvent) => {
      const wasDrag = drag && drag.id === event.pointerId && drag.engaged;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.id === event.pointerId) {
        drag = null;
        delete el.dataset.panning;
        if (wasDrag && !reduced && samples.length >= 2) {
          const first = samples[0]!;
          const last = samples[samples.length - 1]!;
          const dt = Math.max(1, last.t - first.t);
          let vx = (last.x - first.x) / dt;
          let vy = (last.y - first.y) / dt;
          if (Math.hypot(vx, vy) > 0.15 && performance.now() - last.t < 80) {
            let prevT = performance.now();
            const glide = (now: number) => {
              const dtf = Math.min(48, now - prevT);
              prevT = now;
              const cur = tRef.current;
              commit({ ...cur, x: cur.x + vx * dtf, y: cur.y + vy * dtf });
              const decay = Math.pow(0.92, dtf / 16);
              vx *= decay;
              vy *= decay;
              if (Math.hypot(vx, vy) > 0.02) momentum = requestAnimationFrame(glide);
            };
            momentum = requestAnimationFrame(glide);
          }
        }
      }
    };

    // A drag must not also click the star under the pointer.
    const onClickCapture = (event: MouseEvent) => {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
        suppressClick = false;
      }
    };

    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest("[data-scroll]")) return;
      event.preventDefault();
      touch();
      const r = rect();
      const unit = event.deltaMode === 1 ? 16 : 1;
      const rate = event.ctrlKey ? 0.012 : 0.0016;
      const factor = Math.exp(-event.deltaY * unit * rate);
      const cur = tRef.current;
      commit(zoomAt(cur, cur.k * factor, event.clientX - r.left, event.clientY - r.top, limitsRef.current));
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(momentum);
    };
  }, [el, commit, reduced, stopTween]);

  const zoomBy = useCallback(
    (factor: number) => {
      interacted.current = true;
      setMoving(true);
      const { w, h } = sizeRef.current;
      const cur = tRef.current;
      flyTo(zoomAt(cur, cur.k * factor, w / 2, h / 2, limitsRef.current), 280);
    },
    [flyTo],
  );

  const fitView = useCallback(() => {
    const target = fitRef.current;
    if (!target) return;
    interacted.current = false;
    setMoving(false);
    flyTo(target, 600);
  }, [flyTo]);

  const fly = useCallback(
    (target: Transform) => {
      interacted.current = true;
      setMoving(true);
      flyTo(target);
    },
    [flyTo],
  );

  return { size, t, fit, moving, zoomBy, fitView, flyTo: fly, setEl };
}
