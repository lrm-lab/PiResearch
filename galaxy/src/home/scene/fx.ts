// Scene-local mutable state shared by the director, warp streaks and galaxies.

import type { Object3D, Vector3 } from "three";

export const fx = {
  /** Warp streak strength 0..1. */
  warp: 0,
  /** Flash overlay element (white-blue), driven per frame. */
  flashEl: null as HTMLElement | null,
  /** Galaxy root groups by study id, for the camera flight target. */
  galaxies: new Map<string, Object3D>(),
  /** Set by the launch star once it has ignited: the camera dives into it. */
  dive: null as { target: Vector3; href: string } | null,
};
