// The two sections of galaxies, each wrapping into as many lines as it needs.
// One flat list keyed by id, so a study moving from 调研中 to 已完成 glides to
// its new slot instead of remounting. Owns the vertical scroll (inertia, ends)
// and positions the section headings and empty notes.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MathUtils, Vector3 } from "three";
import { splitRows } from "../format";
import { bandOpacity, gallery, emptyEls, rowLabelEls, updateGalleryBounds, updateGalleryLayout } from "../motion";
import { useHome } from "../store";
import { Galaxy } from "./Galaxy";

const anchor = new Vector3();

export function Gallery() {
  const rows = useHome((state) => state.rows);
  const size = useThree((state) => state.size);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);

  useEffect(() => {
    updateGalleryLayout(size.width, size.height, [split.running.length + (gallery.launchSlot ? 1 : 0), split.done.length]);
  }, [size.width, size.height, split]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    updateGalleryBounds();
    // Scroll: inertia, then ease toward the target; spring back past the ends.
    if (!gallery.dragging && gallery.velocity !== 0) {
      gallery.target += gallery.velocity * dt;
      gallery.velocity *= Math.exp(-dt * 4.2);
      if (Math.abs(gallery.velocity) < 0.01) gallery.velocity = 0;
    }
    if (!gallery.dragging) {
      const { min, max } = gallery.bounds;
      if (gallery.target < min) gallery.target = MathUtils.damp(gallery.target, min, 9, delta);
      if (gallery.target > max) gallery.target = MathUtils.damp(gallery.target, max, 9, delta);
    }
    gallery.scroll = useHome.getState().reducedMotion ? gallery.target : MathUtils.damp(gallery.scroll, gallery.target, 8, delta);

    // Headings sit above each section, aligned with its leftmost column.
    const { layout, bounds, params } = gallery;
    const top = bounds.top + gallery.scroll;
    anchor.set(layout.left - params.galaxyRadius * 0.85, top, 0).project(state.camera);
    // Never closer to the left edge than the header's padding.
    const left = Math.max(gallery.width <= 640 ? 16 : 28, (anchor.x * 0.5 + 0.5) * gallery.width);
    for (const section of [0, 1] as const) {
      const label = rowLabelEls[section];
      if (label) {
        anchor.set(0, top + layout.headingY[section], 0).project(state.camera);
        const y = (-anchor.y * 0.5 + 0.5) * gallery.height;
        label.style.transform = `translate3d(${left.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        label.style.opacity = bandOpacity(y, y + 24).toFixed(3);
      }
      const empty = emptyEls[section];
      if (empty) {
        anchor.set(0, top + layout.emptyY[section], 0).project(state.camera);
        const y = (-anchor.y * 0.5 + 0.5) * gallery.height - 20;
        empty.style.transform = `translate3d(-50%, ${y.toFixed(1)}px, 0)`;
        empty.style.opacity = bandOpacity(y, y + 40).toFixed(3);
      }
    }
  });

  // A single array (not two), so React moves a galaxy between sections by key.
  const items = [
    ...split.running.map((row, index) => <Galaxy key={row.id} row={row} rowIndex={0} index={index} />),
    ...split.done.map((row, index) => <Galaxy key={row.id} row={row} rowIndex={1} index={index} />),
  ];
  return <>{items}</>;
}
