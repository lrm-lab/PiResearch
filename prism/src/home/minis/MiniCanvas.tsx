// The one WebGL canvas behind the study grid (lazy chunk: three.js never loads on the home's
// critical path). It sits under the scrolling content, transparent, and draws each registered
// card mini through a drei `View` that tracks the card's mini element, so nine dioramas cost one
// context. Each frame first clears the whole canvas (views only scissor their own rect).

import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { useTheme } from "../../lib/theme";
import { useMiniEntries, setMiniHooks } from "./registry";
import { MiniDiorama } from "./MiniDiorama";

function Clear() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
  }, 0);
  return null;
}

/** Installs the snapshot / invalidate hooks the DOM side uses (registry.ts). */
function Hooks() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    setMiniHooks({
      invalidate: () => get().invalidate(),
      snapshot: (element) => snapshot(get(), element),
    });
    return () => setMiniHooks(null);
  }, [get]);
  return null;
}

/** Render one frame now and copy `element`'s rect out of the drawing buffer (same task, so the
 *  buffer is still valid without preserveDrawingBuffer). */
function snapshot(state: RootState, element: HTMLElement): HTMLCanvasElement | null {
  state.advance(performance.now(), true);
  const source = state.gl.domElement;
  const canvasRect = source.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || !canvasRect.width) return null;
  const ratio = source.width / canvasRect.width;
  const out = document.createElement("canvas");
  out.width = Math.round(rect.width * ratio);
  out.height = Math.round(rect.height * ratio);
  const context = out.getContext("2d");
  if (!context) return null;
  context.drawImage(
    source,
    (rect.left - canvasRect.left) * ratio,
    (rect.top - canvasRect.top) * ratio,
    rect.width * ratio,
    rect.height * ratio,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

export default function MiniCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  const entries = useMiniEntries();
  const theme = useTheme();
  return (
    <Canvas
      aria-hidden="true"
      flat
      frameloop={reducedMotion ? "demand" : "always"}
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color(0x000000), 0);
      }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Clear />
      <Hooks />
      {entries.map((entry) => (
        <View key={entry.id} track={entry.track as RefObject<HTMLElement>} index={1}>
          <MiniDiorama id={entry.id} track={entry.track} theme={theme} reducedMotion={reducedMotion} />
        </View>
      ))}
    </Canvas>
  );
}
