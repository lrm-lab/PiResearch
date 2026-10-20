// The two rows of galaxies. One flat list keyed by id, so a study moving
// from 调研中 to 已完成 glides to its new slot instead of remounting.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MathUtils, Vector3 } from "three";
import { splitRows } from "../format";
import { gallery, emptyEls, rowLabelEls, updateGalleryLayout } from "../motion";
import { useHome } from "../store";
import { Galaxy } from "./Galaxy";

const anchor = new Vector3();

export function Gallery() {
  const rows = useHome((state) => state.rows);
  const size = useThree((state) => state.size);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);

  useEffect(() => {
    updateGalleryLayout(size.width, size.height, Math.max(split.running.length + (gallery.launchSlot ? 1 : 0), split.done.length));
  }, [size.width, size.height, split]);

  // Row headings and empty notes follow the rows' screen height.
  useFrame((state, delta) => {
    const params = gallery.params;
    // Pan: inertia, then ease toward the target.
    if (!gallery.dragging && gallery.velocity !== 0) {
      gallery.target += gallery.velocity * Math.min(delta, 0.05);
      gallery.velocity *= Math.exp(-Math.min(delta, 0.05) * 4.2);
      if (Math.abs(gallery.velocity) < 0.01) gallery.velocity = 0;
    }
    if (!gallery.dragging) {
      const { min, max } = gallery.bounds;
      if (gallery.target < min) gallery.target = MathUtils.damp(gallery.target, min, 9, delta);
      if (gallery.target > max) gallery.target = MathUtils.damp(gallery.target, max, 9, delta);
    }
    gallery.scroll = useHome.getState().reducedMotion ? gallery.target : MathUtils.damp(gallery.scroll, gallery.target, 8, delta);

    for (const row of [0, 1] as const) {
      anchor.set(0, params.rowY[row] + params.galaxyRadius * 1.02, 0).project(state.camera);
      const y = (-anchor.y * 0.5 + 0.5) * gallery.height;
      const label = rowLabelEls[row];
      if (label) label.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      const empty = emptyEls[row];
      if (empty) {
        anchor.set(0, params.rowY[row], 0).project(state.camera);
        empty.style.transform = `translate3d(-50%, ${((-anchor.y * 0.5 + 0.5) * gallery.height).toFixed(1)}px, 0)`;
      }
    }
  });

  // A single array (not two), so React moves a galaxy between rows by key.
  const items = [
    ...split.running.map((row, index) => <Galaxy key={row.id} row={row} rowIndex={0} index={index} rowLen={split.running.length} />),
    ...split.done.map((row, index) => <Galaxy key={row.id} row={row} rowIndex={1} index={index} rowLen={split.done.length} />),
  ];
  return <>{items}</>;
}
