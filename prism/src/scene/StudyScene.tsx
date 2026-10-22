// The study page's 3D task map (DESIGN.md §3): a lit desk diorama on the page colour.
//
// Contract with the page chrome (src/study/**):
// - default export, fills its positioned parent (`absolute inset-0`);
// - reads everything from `useStudy` and reacts to each new `cameraCommand.nonce`;
// - `rightInset` / `bottomInset` are the CSS px covered by the detail panel / bottom sheet; camera
//   framing keeps the subject centred in the uncovered area and follows changes live;
// - the root carries `data-scene-ready="true"` once the first snapshot is on stage (the canvas
//   fades in by itself, nothing for the chrome to do);
// - accessible names: a visually hidden list of one button per node (goal first, then id order)
//   with `ariaLabel()` text; click selects, focus hovers. The scene binds no keyboard shortcuts;
// - while `tab !== "map"` (the chrome keeps the scene mounted but hidden) the frame loop stops;
//   the intro waits for the map to show, and the latest camera command runs on the first visible
//   frame.

import { Canvas } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import { ariaLabel } from "../lib/activity";
import { compareNodes } from "../lib/order";
import { hasWebGL2 } from "../lib/webgl";
import { useStudy } from "../study/store";
import { cx } from "../ui/cx";
import { FOV } from "./CameraRig";
import { SceneRoot } from "./SceneRoot";

export interface StudySceneProps {
  /** Width in CSS px of the detail panel covering the right edge (0 when closed or on mobile);
   *  camera framing keeps the focused card centred in the uncovered area. */
  rightInset: number;
  /** Height in CSS px of a bottom sheet covering the bottom edge (mobile), else 0. */
  bottomInset: number;
}

/** A press that moved further than this (px) is a drag, not a click. */
const CLICK_SLOP = 6;

function webglAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("nowebgl") === "1") return false;
  return hasWebGL2();
}

/** One hidden button per node so screen readers (and Tab) can reach every task. */
function SceneA11yList() {
  const view = useStudy((s) => s.view);
  const selectedId = useStudy((s) => s.selectedId);
  const nodes = useMemo(() => {
    const seen = new Set<string>();
    return [...(view?.nodes ?? [])]
      .filter((node) => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return true;
      })
      .sort(compareNodes);
  }, [view]);
  if (!nodes.length) return null;
  const store = useStudy.getState;
  return (
    <ul className="sr-only" aria-label="任务图">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            aria-label={ariaLabel(view, node)}
            aria-pressed={selectedId === node.id}
            onClick={() => store().select(node.id)}
            onFocus={() => store().hover(node.id)}
            onBlur={() => store().unhover(node.id)}
          />
        </li>
      ))}
    </ul>
  );
}

export default function StudyScene({ rightInset, bottomInset }: StudySceneProps) {
  const supported = useMemo(webglAllowed, []);
  const quality = useStudy((s) => s.effectiveQuality);
  const visible = useStudy((s) => s.tab === "map");
  const [ready, setReady] = useState(false);
  const labelLayer = useRef<HTMLDivElement>(null!);
  const press = useRef<{ x: number; y: number } | null>(null);
  const onReady = useCallback(() => setReady(true), []);

  if (!supported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-primary p-6 text-center text-sm text-tertiary">
        当前浏览器不支持 WebGL2，无法显示 3D 任务图。请切换到「任务」查看列表。
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-primary"
      data-scene-ready={ready ? "true" : "false"}
      onPointerDownCapture={(event) => {
        press.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <Canvas
        className={cx("absolute! inset-0 transition-opacity duration-700 ease-out", ready ? "opacity-100" : "opacity-0")}
        flat
        frameloop={visible ? "always" : "never"}
        dpr={quality === "high" ? [1, 2] : 1}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        camera={{ position: [0, 60, 40], fov: FOV, near: 0.3, far: 900 }}
        onPointerMissed={(event) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
          useStudy.getState().select(null);
        }}
      >
        <SceneRoot rightInset={rightInset} bottomInset={bottomInset} visible={visible} labelLayer={labelLayer} onReady={onReady} />
      </Canvas>
      {/* Html labels render into this stable layer (drei re-targets otherwise and drops labels). */}
      <div ref={labelLayer} className="pointer-events-none absolute inset-0 isolate overflow-hidden" />
      <SceneA11yList />
    </div>
  );
}
