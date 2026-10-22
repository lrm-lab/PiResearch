// Live tool calls float above their card as small dark terminal chips (mono, typed with a caret);
// 【思考】 shows as a shimmering "正在想下一步". DOM via drei Html, portalled into the label layer.

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { type Group, Vector3 } from "three";
import { FOV } from "./CameraRig";
import type { LiveCall, Snapshot } from "../types/api";
import type { Layout, LayoutNode } from "./layout";
import type { SceneRuntime } from "./runtime";

function chipText(call: LiveCall): string {
  const label = call.label || "";
  const hint = (call.hint || "").trim();
  if (!hint || label.includes(hint)) return label;
  // A bare "【执行】" label: show what runs.
  return /】$/.test(label) ? `${label}${hint}` : label;
}

function Typed({ text, reduced }: { text: string; reduced: boolean }) {
  const chars = Array.from(text);
  const [count, setCount] = useState(reduced ? chars.length : 0);
  useEffect(() => {
    const total = Array.from(text).length;
    if (reduced) {
      setCount(total);
      return;
    }
    setCount(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= total) window.clearInterval(timer);
    }, 34);
    return () => window.clearInterval(timer);
  }, [text, reduced]);
  return <span className="prism-caret min-w-0 truncate">{chars.slice(0, count).join("")}</span>;
}

const scratch = new Vector3();
/** Chips fade out when their card is smaller than this on screen (phone overview). */
const MIN_CARD_PX = 56;
const FULL_CARD_PX = 80;

const SHIMMER_ON_TERMINAL = { "--shimmer-contrast": "var(--color-terminal-fg)" } as CSSProperties;

const LiveChip = memo(function LiveChip({ id, lay, live, portal, rt, reduced }: { id: string; lay: LayoutNode; live: LiveCall[]; portal: RefObject<HTMLElement>; rt: SceneRuntime; reduced: boolean }) {
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  const anchor = useRef<Group>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);
  const call = live[live.length - 1]!;
  const thinking = call.tool === "思考";
  const extra = live.length - 1;

  useFrame(() => {
    const g = anchor.current;
    const el = wrap.current;
    if (!g || !el) return;
    const m = rt.motion.get(id);
    // Just beyond the card's far edge, so the chip never sits on its face.
    g.position.set(lay.x, (m?.y ?? 0) + 0.3, lay.z - lay.d * 0.62);
    // Card width on screen (the lens shift keeps world-per-pixel at the nominal FOV).
    const distance = camera.getWorldPosition(scratch).distanceTo(g.position);
    const cardPx = (lay.w * height) / (2 * Math.max(0.01, distance) * Math.tan((FOV * Math.PI) / 360));
    const size = Math.max(0, Math.min(1, (cardPx - MIN_CARD_PX) / (FULL_CARD_PX - MIN_CARD_PX)));
    const visible = m?.shown && m.landedAt <= rt.time ? Math.max(0, Math.min(1, (m.opacity - 0.3) / 0.5)) * size : 0;
    const value = Math.round(visible * 100) / 100;
    if (value !== shown.current) {
      shown.current = value;
      el.style.opacity = String(value);
      el.style.visibility = value > 0 ? "visible" : "hidden";
    }
  }, -1);

  return (
    <group ref={anchor}>
      <Html portal={portal} zIndexRange={[9, 1]} pointerEvents="none">
        <div ref={wrap} aria-hidden="true" style={{ opacity: 0, visibility: "hidden", transform: "translate(-50%, -100%)" }} className="transition-opacity duration-300">
          <div className="flex max-w-[15rem] items-center gap-2 rounded-lg bg-terminal px-2 py-1 font-mono text-xs leading-[1.125rem] whitespace-nowrap text-terminal shadow-md ring-1 ring-white/10">
            <span className="flex shrink-0 gap-[3px]" aria-hidden="true">
              <span className="size-1.5 rounded-full bg-red-400" />
              <span className="size-1.5 rounded-full bg-amber-400" />
              <span className="size-1.5 rounded-full bg-green-400" />
            </span>
            {thinking ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-terminal/60">【思考】</span>
                <span className={reduced ? "text-terminal/80" : "prism-shimmer text-terminal/45"} style={SHIMMER_ON_TERMINAL}>
                  {call.hint || "正在想下一步"}
                </span>
              </span>
            ) : (
              <Typed text={chipText(call)} reduced={reduced} />
            )}
            {extra > 0 ? <span className="shrink-0 text-terminal/55 tabular">+{extra}</span> : null}
          </div>
        </div>
      </Html>
    </group>
  );
});

export function LiveChips({ view, layout, portal, rt, reduced }: { view: Snapshot | null; layout: Layout; portal: RefObject<HTMLElement>; rt: SceneRuntime; reduced: boolean }) {
  const seen = new Set<string>();
  const nodes = (view?.nodes ?? []).filter((node) => {
    if (node.goal || !node.live?.length || seen.has(node.id) || !layout.nodes.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
  return (
    <>
      {nodes.map((node) => (
        <LiveChip key={node.id} id={node.id} lay={layout.nodes.get(node.id)!} live={node.live} portal={portal} rt={rt} reduced={reduced} />
      ))}
    </>
  );
}
