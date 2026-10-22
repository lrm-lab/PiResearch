// Post-processing per theme and quality tier, and the frame-time monitor behind quality "auto".
//   light high: N8AO (contact occlusion) + gentle tilt-shift (miniature look) + SMAA. No bloom.
//   dark  high: N8AO (softer) + mild bloom on beams / rays / edges + tilt-shift + SMAA.
//   low (both): SMAA only (the Canvas also caps DPR at 1).

import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2 } from "@react-three/postprocessing";
import { useRef } from "react";
import type { Theme } from "../lib/theme";
import { useStudy, type QualityTier } from "../study/store";

export function Effects({ theme, quality }: { theme: Theme; quality: QualityTier }) {
  const high = quality === "high";
  const dark = theme === "dark";
  return (
    <EffectComposer key={`${theme}-${quality}`} multisampling={0} enableNormalPass={false}>
      {high ? <N8AO halfRes aoRadius={0.7} distanceFalloff={0.45} intensity={dark ? 1.6 : 2.4} aoSamples={12} denoiseSamples={4} denoiseRadius={10} /> : <></>}
      {high && dark ? <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.18} intensity={0.55} radius={0.62} levels={6} /> : <></>}
      {high ? <TiltShift2 blur={0.035} taper={0.75} start={[0, 0.52]} end={[1, 0.52]} samples={8} /> : <></>}
      <SMAA />
    </EffectComposer>
  );
}

/**
 * quality "auto": an average frame time over 22 ms for 3 s drops to the low tier (never back up
 * within a session; the store resets it with setQuality).
 */
export function QualityMonitor() {
  const quality = useStudy((s) => s.quality);
  const tier = useStudy((s) => s.effectiveQuality);
  const setAutoTier = useStudy((s) => s.setAutoTier);
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
    if (a.warm < 3) {
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
