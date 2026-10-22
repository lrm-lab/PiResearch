// The desk: an endless plane in the page colour with a faint dot grid and a soft tint under the
// centre, fogged into exactly the page colour (no horizon, no edge). Plus the lights.

import { useEffect, useMemo } from "react";
import { SURFACE } from "../lib/palette";
import type { Theme } from "../lib/theme";
import { mixHex } from "./colors";
import { deskMaterial } from "./materials";

export function Desk({ theme, radius }: { theme: Theme; radius: number }) {
  const material = useMemo(() => deskMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const s = SURFACE[theme];
    material.uniforms.uGround!.value.set(s.ground);
    material.uniforms.uTint!.value.set(s.groundTint);
    material.uniforms.uDot!.value.set(s.grid);
    material.uniforms.uDotAlpha!.value = theme === "light" ? 1 : 0.9;
  }, [material, theme]);
  useEffect(() => {
    material.uniforms.uTintRadius!.value = Math.max(6, radius * 0.95);
  }, [material, radius]);

  return (
    <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={-10}>
      <planeGeometry args={[900, 900]} />
    </mesh>
  );
}

/** Product-render lighting: soft key from behind-left, hemisphere fill, a faint front fill. */
export function Lights({ theme }: { theme: Theme }) {
  // Light colour is white in both themes (the light, not the surface, is white).
  const white = SURFACE.light.card;
  const light = theme === "light";
  return (
    <>
      <hemisphereLight args={[white, light ? mixHex(SURFACE.light.cardEdge, white, 0.55) : SURFACE.dark.cardEdge, light ? 1.45 : 0.9]} />
      <directionalLight position={[-6, 12, -5]} intensity={light ? 1.15 : 1.0} color={white} />
      <directionalLight position={[4, 6, 10]} intensity={light ? 0.35 : 0.3} color={white} />
    </>
  );
}
