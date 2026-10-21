// Deep space behind the gallery: a nebula shell and two star layers that
// drift slowly and parallax against the gallery pan.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, ShaderMaterial, SphereGeometry, type Group } from "three";
import { rng } from "../../lib/math";
import { gallery } from "../motion";
import { nebulaFragment, nebulaVertex, shared, starFragment, starVertex } from "./shaders";

const STAR_TINTS: [number, number, number][] = [
  [1, 1, 1],
  [0.78, 0.86, 1],
  [0.66, 0.78, 1],
  [1, 0.92, 0.8],
  [1, 0.84, 0.7],
  [0.8, 1, 0.96],
];

function starLayer(count: number, inner: number, outer: number, sizeMin: number, sizeMax: number, seed: number): BufferGeometry {
  const next = rng(seed);
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = next() * 2 - 1;
    const theta = next() * Math.PI * 2;
    // Bias toward a band so the sky has a "milky way".
    const banded = next() < 0.45;
    const y = banded ? u * 0.28 : u;
    const s = Math.sqrt(1 - y * y);
    const r = inner + (outer - inner) * next();
    position[i * 3] = Math.cos(theta) * s * r;
    position[i * 3 + 1] = y * r;
    position[i * 3 + 2] = Math.sin(theta) * s * r;
    const tint = STAR_TINTS[Math.floor(next() * STAR_TINTS.length)]!;
    const bright = 0.35 + Math.pow(next(), 3) * 0.9;
    color[i * 3] = tint[0] * bright;
    color[i * 3 + 1] = tint[1] * bright;
    color[i * 3 + 2] = tint[2] * bright;
    size[i] = sizeMin + Math.pow(next(), 4) * (sizeMax - sizeMin);
    phase[i] = next();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("color", new BufferAttribute(color, 3));
  geometry.setAttribute("aSize", new BufferAttribute(size, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phase, 1));
  return geometry;
}

export function Backdrop({ quality }: { quality: "high" | "low" }) {
  const far = useRef<Group>(null!);
  const near = useRef<Group>(null!);
  const assets = useMemo(() => {
    const nebulaGeometry = new SphereGeometry(320, 48, 32);
    const nebula = new ShaderMaterial({
      vertexShader: nebulaVertex,
      fragmentShader: nebulaFragment,
      uniforms: { uTime: shared.uTime },
      side: BackSide,
      depthWrite: false,
    });
    const stars = new ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: { uTime: shared.uTime, uMotion: shared.uMotion, uPixelRatio: shared.uPixelRatio },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const farStars = starLayer(quality === "high" ? 5200 : 2600, 180, 260, 1.2, 4.2, 11);
    const nearStars = starLayer(quality === "high" ? 1300 : 700, 45, 110, 1.6, 5.5, 23);
    return { nebulaGeometry, nebula, stars, farStars, nearStars };
  }, [quality]);

  useEffect(
    () => () => {
      assets.nebulaGeometry.dispose();
      assets.nebula.dispose();
      assets.stars.dispose();
      assets.farStars.dispose();
      assets.nearStars.dispose();
    },
    [assets],
  );

  useFrame(() => {
    const t = shared.uTime.value * shared.uMotion.value;
    far.current.rotation.y = t * 0.0035 - gallery.scroll * 0.004;
    far.current.rotation.x = 0.12;
    near.current.rotation.y = t * 0.008 - gallery.scroll * 0.016;
    near.current.rotation.x = 0.1 + gallery.pointer.y * 0.01;
  });

  return (
    <>
      <group ref={far}>
        <mesh geometry={assets.nebulaGeometry} material={assets.nebula} renderOrder={-10} />
        <points geometry={assets.farStars} material={assets.stars} frustumCulled={false} renderOrder={-9} />
      </group>
      <group ref={near}>
        <points geometry={assets.nearStars} material={assets.stars} frustumCulled={false} renderOrder={-8} />
      </group>
    </>
  );
}
