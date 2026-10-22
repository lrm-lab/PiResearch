// The paper stack under each card (one instanced mesh for the whole desk). Its height grows with
// the task's step_count; sheets fan in under a dropping card and compress when the card sinks.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { SURFACE } from "../lib/palette";
import type { Theme } from "../lib/theme";
import type { Snapshot } from "../types/api";
import { mixHex } from "./colors";
import { CARD_D, CARD_W } from "./geometry";
import { SHEET_PITCH, sheetCount, type Layout } from "./layout";
import type { SceneRuntime } from "./runtime";
import { easeOutCubic, hash01 } from "./tween";

interface Sheet {
  id: string;
  index: number;
  x: number;
  z: number;
  k: number;
  /** Rest jitter (yaw, x, z) and the fan-in swing. */
  yaw: number;
  dx: number;
  dz: number;
  swing: number;
  tint: number;
}

const dummy = new Object3D();
const color = new Color();

export function Sheets({ view, layout, theme, reduced, rt }: { view: Snapshot | null; layout: Layout; theme: Theme; reduced: boolean; rt: SceneRuntime }) {
  const mesh = useRef<InstancedMesh>(null);
  const sheets = useMemo(() => {
    const list: Sheet[] = [];
    const seen = new Set<string>();
    for (const node of view?.nodes ?? []) {
      if (node.goal || seen.has(node.id)) continue;
      seen.add(node.id);
      const lay = layout.nodes.get(node.id);
      if (!lay) continue;
      const count = sheetCount(node.step_count);
      for (let i = 0; i < count; i++) {
        const h = hash01(`${node.id}:${i}`);
        const h2 = hash01(`${i}:${node.id}`);
        list.push({
          id: node.id,
          index: i,
          x: lay.x,
          z: lay.z,
          k: lay.k,
          yaw: (h - 0.5) * 0.07,
          dx: (h2 - 0.5) * 0.05,
          dz: (h - 0.5) * 0.04,
          swing: (h2 > 0.5 ? 1 : -1) * (0.35 + h * 0.4),
          tint: i % 3 === 0 ? 0.55 : i % 2 ? 0.2 : 0,
        });
      }
    }
    return list;
  }, [view, layout]);

  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Paper colours per theme; dimmed sheets lean toward the page colour.
  const palette = useMemo(() => {
    const s = SURFACE[theme];
    const paper = theme === "light" ? s.card : mixHex(s.card, s.cardEdge, 0.5);
    const edge = mixHex(paper, s.cardEdge, theme === "light" ? 0.9 : 0.6);
    return { paper, edge, ground: new Color(s.ground) };
  }, [theme]);
  const baseColors = useMemo(
    () => sheets.map((sheet) => new Color(mixHex(palette.paper, palette.edge, sheet.tint))),
    [sheets, palette],
  );

  const capacity = Math.max(1, sheets.length);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = rt.time;
    for (let n = 0; n < sheets.length; n++) {
      const s = sheets[n]!;
      const motion = rt.motion.get(s.id);
      const dropT = rt.dropAt.get(s.id);
      if (!motion || !motion.shown || dropT === undefined) {
        dummy.position.set(0, -10, 0);
        dummy.scale.setScalar(0.0001);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        m.setMatrixAt(n, dummy.matrix);
        continue;
      }
      const appear = reduced ? 1 : easeOutCubic((t - dropT - 0.08 - s.index * 0.022) / 0.38);
      const squash = 1 - 0.75 * motion.sink;
      const pitch = SHEET_PITCH * squash;
      const fan = 1 - appear;
      dummy.position.set(s.x + (s.dx + fan * s.swing * 0.6) * s.k, pitch * (s.index + 0.5), s.z + (s.dz + fan * 0.25) * s.k);
      dummy.rotation.set(0, s.yaw + fan * s.swing, 0);
      const visible = appear > 0.001 ? 1 : 0.0001;
      dummy.scale.set(CARD_W * 0.94 * s.k * visible, pitch * 0.72 * visible, CARD_D * 0.92 * s.k * visible);
      dummy.updateMatrix();
      m.setMatrixAt(n, dummy.matrix);
      color.copy(baseColors[n]!).lerp(palette.ground, 1 - motion.opacity);
      m.setColorAt(n, color);
    }
    m.count = sheets.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, -1);

  return <instancedMesh key={capacity} ref={mesh} args={[geometry, material, capacity]} frustumCulled={false} />;
}
