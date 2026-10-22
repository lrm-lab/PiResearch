// Post-processing and the auto quality monitor.
// high: Bloom (mipmap blur) + ChromaticAberration toward the edges + a faint
// grain (premultiplied, so empty space stays clean) + Vignette.
// low: half-resolution bloom + Vignette.

import { useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type BloomEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import { Vector2 } from "three";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";

const BLOOM = 0.7;

export function Effects({ fx }: { fx: SceneFx }) {
  const quality = useGalaxy((state) => state.effectiveQuality);
  const high = quality === "high";
  const bloom = useRef<BloomEffect>(null);
  const offset = useMemo(() => new Vector2(0.0011, 0.0011), []);

  useFrame(() => {
    const effect = bloom.current;
    if (!effect) return;
    const pulse = fx.reduced ? 0 : 0.5 + 0.5 * Math.sin(fx.time * 3.927);
    // Bloom backs off with the core glare so a close look at the goal stays readable.
    effect.intensity = BLOOM * (1 + fx.live * 0.16 * pulse) * (0.55 + 0.45 * fx.glare);
  });

  return (
    <EffectComposer key={quality} multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={bloom}
        mipmapBlur
        luminanceThreshold={0.72}
        luminanceSmoothing={0.25}
        intensity={BLOOM}
        radius={0.8}
        levels={high ? 8 : 6}
        resolutionScale={high ? 1 : 0.5}
      />
      {high ? (
        <ChromaticAberration offset={offset} radialModulation modulationOffset={0.32} />
      ) : (
        <></>
      )}
      {high ? <Noise premultiply opacity={0.06} blendFunction={BlendFunction.ADD} /> : <></>}
      <Vignette offset={0.26} darkness={0.8} />
    </EffectComposer>
  );
}

/** quality "auto": average frame time over 22 ms for 3 s drops to the low tier (never back up). */
export function QualityMonitor() {
  const quality = useGalaxy((state) => state.quality);
  const tier = useGalaxy((state) => state.effectiveQuality);
  const setAutoTier = useGalaxy((state) => state.setAutoTier);
  const acc = useRef({ warm: 0, sum: 0, frames: 0 });

  useFrame((_, delta) => {
    const a = acc.current;
    if (quality !== "auto" || tier !== "high") {
      a.warm = 0;
      a.sum = 0;
      a.frames = 0;
      return;
    }
    if (document.hidden || delta > 0.25) {
      a.sum = 0;
      a.frames = 0;
      return;
    }
    // Ignore shader compilation and the intro flight.
    if (a.warm < 2.5) {
      a.warm += delta;
      return;
    }
    a.sum += delta;
    a.frames += 1;
    if (a.sum >= 3) {
      if (a.sum / a.frames > 0.022) setAutoTier("low");
      a.sum = 0;
      a.frames = 0;
    }
  });
  return null;
}
