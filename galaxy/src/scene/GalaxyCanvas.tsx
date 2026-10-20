// The WebGL scene. Reads the store only; data loading happens in the page.

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { SPACE } from "../lib/palette";
import { useGalaxy } from "../store";
import { Bodies } from "./Bodies";
import { CameraRig } from "./CameraRig";
import { CoreStar } from "./CoreStar";
import { Edges } from "./Edges";
import { Effects, QualityMonitor } from "./Effects";
import { SceneFx } from "./fx";
import { FxDriver } from "./FxDriver";
import { GalaxyDisc } from "./GalaxyDisc";
import { buildGraph } from "./graph";
import { CometChips, Labels } from "./Labels";
import { Particles } from "./Particles";
import { Shockwaves } from "./Shockwaves";
import { Starfield } from "./Starfield";
import { useComets } from "./useComets";
import { useLayout } from "./useLayout";

/** A press that moved further than this (px) is a drag, not a click. */
const CLICK_SLOP = 6;

export function GalaxyCanvas() {
  const quality = useGalaxy((state) => state.effectiveQuality);
  const select = useGalaxy((state) => state.select);
  const view = useGalaxy((state) => state.view);
  const layout = useLayout();
  const graph = useMemo(() => buildGraph(view, layout), [view, layout]);
  const fx = useMemo(() => new SceneFx(), []);
  useEffect(() => () => fx.dispose(), [fx]);
  const comets = useComets(graph, fx);
  // Labels render into this stable layer. Without an explicit portal, drei
  // <Html> re-targets once R3F connects its events and unmounts each label
  // root mid-render; the deferred unmount then wipes the first label.
  const labelLayer = useRef<HTMLDivElement>(null!);
  const press = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="absolute inset-0"
      onPointerDownCapture={(event) => {
        press.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <Canvas
        className="absolute! inset-0"
        flat
        dpr={quality === "high" ? [1, 2] : 1}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        camera={{ position: [0, 60, 80], fov: 45, near: 0.05, far: 3200 }}
        onPointerMissed={(event) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
          select(null);
        }}
      >
        <color attach="background" args={[SPACE]} />
        <FxDriver fx={fx} graph={graph} />
        <Starfield fx={fx} />
        <GalaxyDisc fx={fx} extent={graph.extent} />
        <Edges graph={graph} fx={fx} />
        <CoreStar graph={graph} fx={fx} />
        <Bodies graph={graph} fx={fx} />
        <Particles graph={graph} fx={fx} comets={comets} />
        <Shockwaves fx={fx} />
        <Labels graph={graph} fx={fx} portal={labelLayer} />
        <CometChips comets={comets} fx={fx} portal={labelLayer} />
        <CameraRig graph={graph} fx={fx} />
        <Effects fx={fx} />
        <QualityMonitor />
      </Canvas>
      <div ref={labelLayer} className="pointer-events-none absolute inset-0 isolate overflow-hidden" />
    </div>
  );
}
