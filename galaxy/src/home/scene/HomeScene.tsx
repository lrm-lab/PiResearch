// The observatory: one shared R3F scene with the backdrop, the gallery of
// study galaxies, the launch star and the camera director. Loaded lazily so
// three.js stays out of the first paint.

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect } from "react";
import { Vector2 } from "three";
import { SPACE } from "../../lib/palette";
import { FOV } from "../layout";
import { gallery } from "../motion";
import { useHome, type Quality } from "../store";
import { Backdrop } from "./Backdrop";
import { Director } from "./Director";
import { fx } from "./fx";
import { Gallery } from "./Gallery";
import { LaunchStar } from "./LaunchStar";
import { shared } from "./shaders";

const CA_OFFSET = new Vector2(0.0007, 0.0005);
const DRAG_THRESHOLD = 6;

function Clock() {
  useFrame((state) => {
    const store = useHome.getState();
    shared.uTime.value = state.clock.elapsedTime;
    shared.uMotion.value = store.reducedMotion ? 0 : 1;
    shared.uPixelRatio.value = state.gl.getPixelRatio();
    shared.uScale.value = (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(((FOV / 2) * Math.PI) / 180));
  });
  return null;
}

function Effects({ quality }: { quality: Quality }) {
  const high = quality === "high";
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.25} intensity={high ? 1.25 : 1} radius={0.78} resolutionScale={high ? 1 : 0.5} />
      <ChromaticAberration offset={high ? CA_OFFSET : new Vector2(0, 0)} radialModulation modulationOffset={0.35} blendFunction={high ? BlendFunction.NORMAL : BlendFunction.SKIP} />
      <Noise premultiply opacity={high ? 0.32 : 0} blendFunction={high ? BlendFunction.SCREEN : BlendFunction.SKIP} />
      <Vignette offset={0.28} darkness={0.78} />
    </EffectComposer>
  );
}

/** Whether a key press belongs to a text field (or other control that uses it). */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, [role='dialog']") !== null;
}

/**
 * Vertical scroll by drag (touch or mouse), wheel and keys, plus the pointer
 * sway. Bound to the stage (not the page), so the composer keeps its own scroll.
 */
function useStageInput(stage: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let downY = 0;
    let lastY = 0;
    let lastT = 0;
    let pointerId: number | null = null;
    const busy = () => {
      const state = useHome.getState();
      return Boolean(state.flight || state.launch);
    };
    const scrollBy = (units: number) => {
      gallery.velocity = 0;
      const { min, max } = gallery.bounds;
      gallery.target = Math.min(max, Math.max(min, gallery.target + units));
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || busy()) return;
      pointerId = event.pointerId;
      downY = lastY = event.clientY;
      lastT = performance.now();
      gallery.dragged = false;
      gallery.velocity = 0;
    };
    const onMove = (event: PointerEvent) => {
      gallery.pointer.x = (event.clientX / Math.max(1, innerWidth)) * 2 - 1;
      gallery.pointer.y = -((event.clientY / Math.max(1, innerHeight)) * 2 - 1);
      if (pointerId !== event.pointerId) return;
      const dy = event.clientY - lastY;
      if (!gallery.dragging && Math.abs(event.clientY - downY) > DRAG_THRESHOLD && !gallery.bounds.fits) {
        gallery.dragging = true;
        gallery.dragged = true;
        useHome.getState().hover(null);
        element.classList.add("is-dragging");
      }
      if (gallery.dragging) {
        const now = performance.now();
        // The content follows the finger: dragging down lowers it (scroll decreases).
        const step = -dy / gallery.ppu;
        const { min, max } = gallery.bounds;
        // Resist beyond the ends.
        const outside = gallery.target < min || gallery.target > max;
        gallery.target += outside ? step * 0.35 : step;
        const dt = Math.max(1, now - lastT) / 1000;
        gallery.velocity = gallery.velocity * 0.6 + (step / dt) * 0.4;
        lastT = now;
      }
      lastY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      if (gallery.dragging) {
        gallery.dragging = false;
        element.classList.remove("is-dragging");
        if (performance.now() - lastT > 90) gallery.velocity = 0;
        // Clicks fire after pointerup: forget the drag once they have.
        setTimeout(() => (gallery.dragged = false), 0);
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (busy() || gallery.bounds.fits) return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      gallery.velocity = 0;
      const { min, max } = gallery.bounds;
      const over = 40 / gallery.ppu;
      gallery.target = Math.min(max + over, Math.max(min - over, gallery.target + (event.deltaY * scale) / gallery.ppu));
    };
    // Page keys scroll the gallery; arrows on a caption move focus instead (Captions.tsx).
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || busy() || typing(event.target)) return;
      if (useHome.getState().deleteTarget || gallery.bounds.fits) return;
      const page = (gallery.band.top - gallery.band.bottom) * 0.85;
      const line = 80 / gallery.ppu;
      const onCaption = event.target instanceof HTMLElement && event.target.closest(".home-captions") !== null;
      const onControl = event.target instanceof HTMLElement && event.target.closest("a, button") !== null;
      switch (event.key) {
        case "PageDown":
          scrollBy(page);
          break;
        case "PageUp":
          scrollBy(-page);
          break;
        case " ":
          if (onControl) return;
          scrollBy(event.shiftKey ? -page : page);
          break;
        case "ArrowDown":
        case "ArrowUp":
          if (onCaption) return;
          scrollBy(event.key === "ArrowDown" ? line : -line);
          break;
        case "Home":
        case "End":
          if (onCaption) return;
          scrollBy(event.key === "Home" ? -Infinity : Infinity);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [stage]);
}

export default function HomeScene({ stage }: { stage: React.RefObject<HTMLDivElement | null> }) {
  const quality = useHome((state) => state.quality);
  const setQuality = useHome((state) => state.setQuality);
  useStageInput(stage);

  useEffect(() => {
    fx.flashEl = document.querySelector<HTMLElement>(".home-flash");
    useHome.getState().setSceneReady(true);
    return () => {
      fx.flashEl = null;
      useHome.getState().setSceneReady(false);
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <div className="home-canvas" aria-hidden="true">
      <Canvas
        dpr={quality === "high" ? [1, 2] : 1}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false }}
        camera={{ position: [0, 5, 27], fov: FOV, near: 0.05, far: 900 }}
        onPointerMissed={() => useHome.getState().hover(null)}
      >
        <color attach="background" args={[SPACE]} />
        <Clock />
        <PerformanceMonitor onDecline={() => setQuality("low")} flipflops={2} />
        <Backdrop quality={quality} />
        <Gallery />
        <LaunchStar />
        <Director />
        <Effects quality={quality} />
      </Canvas>
    </div>
  );
}
