// The one pointer watcher every moving mascot shares: one passive listener for all of them, at
// most one flush per animation frame, nothing while no mascot is registered.

import { lookToward, STRAIGHT_AHEAD, type MascotLook } from "./look";

interface LookSink {
  element: Element;
  apply: (look: MascotLook) => void;
  x: number;
  y: number;
}

const sinks = new Set<LookSink>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;

function flush(): void {
  frame = 0;
  for (const sink of sinks) {
    let look = STRAIGHT_AHEAD;
    if (pointer) {
      const box = sink.element.getBoundingClientRect();
      look = lookToward(pointer.x - (box.left + box.width / 2), pointer.y - (box.top + box.height / 2));
    }
    if (look.x === sink.x && look.y === sink.y) continue;
    sink.x = look.x;
    sink.y = look.y;
    sink.apply(look);
  }
}

function schedule(): void {
  if (frame === 0) frame = requestAnimationFrame(flush);
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
}

function onPointerOut(): void {
  pointer = null;
  schedule();
}

function listen(): void {
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerOut, { passive: true });
  window.addEventListener("blur", onPointerOut);
}

function unlisten(): void {
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerleave", onPointerOut);
  window.removeEventListener("blur", onPointerOut);
}

/** Register a mascot element; returns the unregister function. */
export function followPointer(element: Element, apply: (look: MascotLook) => void): () => void {
  if (typeof window === "undefined" || window.matchMedia("(hover: none)").matches) return () => {};
  const sink: LookSink = { element, apply, x: STRAIGHT_AHEAD.x, y: STRAIGHT_AHEAD.y };
  if (sinks.size === 0) listen();
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
    if (sinks.size === 0) unlisten();
  };
}
