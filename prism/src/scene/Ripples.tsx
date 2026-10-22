// Landing ripples: two thin rings spreading over the desk where a card lands or flips.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Mesh, MeshBasicMaterial, RingGeometry } from "three";
import type { SceneRuntime } from "./runtime";
import { easeOutCubic } from "./tween";

const POOL = 16;
const LIFE = 1.15;

export function Ripples({ rt }: { rt: SceneRuntime }) {
  const geometry = useMemo(() => new RingGeometry(0.96, 1, 72).rotateX(-Math.PI / 2), []);
  const materials = useMemo(() => Array.from({ length: POOL }, () => new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })), []);
  const meshes = useRef<(Mesh | null)[]>([]);
  useEffect(
    () => () => {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
    [geometry, materials],
  );

  useFrame(() => {
    const t = rt.time;
    // Drop expired ripples.
    while (rt.ripples.length && t - rt.ripples[0]!.at > LIFE + 0.3) rt.ripples.shift();
    let slot = 0;
    for (const ripple of rt.ripples) {
      for (const delay of [0, 0.16]) {
        if (slot >= POOL) break;
        const mesh = meshes.current[slot];
        const material = materials[slot]!;
        slot++;
        if (!mesh) continue;
        const p = (t - ripple.at - delay) / LIFE;
        if (p <= 0 || p >= 1) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        const r = ripple.size * (0.45 + easeOutCubic(p) * 0.95);
        mesh.position.set(ripple.x, 0.005, ripple.z);
        mesh.scale.set(r, 1, r * 0.82);
        material.color.set(ripple.color);
        const fade = 1 - p;
        material.opacity = fade * fade * (delay ? 0.35 : 0.6);
      }
    }
    for (; slot < POOL; slot++) {
      const mesh = meshes.current[slot];
      if (mesh) mesh.visible = false;
    }
  }, -1);

  return (
    <>
      {materials.map((material, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshes.current[i] = mesh;
          }}
          geometry={geometry}
          material={material}
          visible={false}
          renderOrder={1}
          raycast={() => null}
        />
      ))}
    </>
  );
}
