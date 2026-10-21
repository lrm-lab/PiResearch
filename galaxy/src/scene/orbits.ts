// Orbit maths shared by the particle shader (shaders/chunks.ts ORBIT) and the
// comet chips, which follow the same analytic path on the CPU. Pure.

import { hash01 } from "../lib/space";

export interface Orbit {
  /** World radius. */
  radius: number;
  /** Inclination around X, radians. */
  incl: number;
  /** Ascending node around Y, radians. */
  node: number;
  /** Angular speed, rad/s. */
  speed: number;
  /** Angle at t = 0. */
  phase: number;
}

export interface Tilt {
  incl: number;
  node: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Offset from the orbit centre at `theta` (same formula as GLSL `orbitPos`). */
export function orbitOffset(radius: number, incl: number, node: number, theta: number, out: Vec3Like): Vec3Like {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const px = radius * c;
  const py = -radius * s * Math.sin(incl);
  const pz = radius * s * Math.cos(incl);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  out.x = px * cn + pz * sn;
  out.y = py;
  out.z = -px * sn + pz * cn;
  return out;
}

/** Position on `orbit` around `center` at scene time `time`. */
export function orbitPosition(orbit: Orbit, center: Vec3Like, time: number, out: Vec3Like): Vec3Like {
  orbitOffset(orbit.radius, orbit.incl, orbit.node, orbit.phase + orbit.speed * time, out);
  out.x += center.x;
  out.y += center.y;
  out.z += center.z;
  return out;
}

/** Stable tilt of a task's accretion disc / vortex axis. */
export function discTilt(id: string): Tilt {
  return { incl: 0.32 + 0.5 * hash01(`${id}|tilt`), node: 2 * Math.PI * hash01(`${id}|node`) };
}

/** Unit normal of the plane a tilt describes. */
export function tiltNormal(tilt: Tilt): [number, number, number] {
  const a = orbitOffset(1, tilt.incl, tilt.node, 0, { x: 0, y: 0, z: 0 });
  const b = orbitOffset(1, tilt.incl, tilt.node, Math.PI / 2, { x: 0, y: 0, z: 0 });
  const nx = a.y * b.z - a.z * b.y;
  const ny = a.z * b.x - a.x * b.z;
  const nz = a.x * b.y - a.y * b.x;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export const MAX_SATELLITES = 48;

/** The 2–3 satellite orbits of a task with `count` satellites. */
export function satelliteOrbits(id: string, bodyRadius: number, count: number): Orbit[] {
  const rings = count <= 12 ? 2 : 3;
  const out: Orbit[] = [];
  for (let k = 0; k < rings; k += 1) {
    const h = hash01(`${id}|orbit|${k}`);
    const h2 = hash01(`${id}|orbit-node|${k}`);
    out.push({
      radius: bodyRadius * (1.85 + 0.62 * k) + 0.05,
      incl: (h - 0.5) * 2.2,
      node: h2 * Math.PI * 2,
      speed: (0.62 / (1 + 0.45 * k)) * (hash01(`${id}|dir|${k}`) < 0.2 ? -1 : 1),
      phase: 0,
    });
  }
  return out;
}

/** Orbit of the j-th live call around a task. `thinking` comets drift slower. */
export function cometOrbit(id: string, bodyRadius: number, j: number, thinking: boolean): Orbit {
  const tilt = discTilt(id);
  return {
    radius: bodyRadius * (2.7 + 0.55 * j) + 0.1,
    incl: tilt.incl + (hash01(`${id}|comet|${j}`) - 0.5) * 0.9,
    node: tilt.node + j * 1.3,
    speed: thinking ? 0.55 : 1.25 + 0.15 * j,
    phase: hash01(`${id}|comet-phase|${j}`) * Math.PI * 2,
  };
}

/** Angular length of a comet trail (radians behind the head). */
export const COMET_TRAIL = 0.95;

/** `【思考】` placeholders render as blinking comets with no chip. */
export function isThinking(call: { tool?: string; label: string }): boolean {
  return call.tool === "思考" || call.label === "【思考】";
}
