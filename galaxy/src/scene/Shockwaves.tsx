// A small pool of expanding rings in the disc plane, spawned by SceneFx
// events: a node is born, a task changes status, or its step count grows.

import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import type { FxEvent, SceneFx } from "./fx";

const POOL = 48;

// Idle or finished slots (age outside [0, 1]) collapse to a point outside the
// clip volume, so they cost no fragments.
const VERTEX = /* glsl */ `
uniform float uTime;
attribute vec3 aCenter;
attribute vec3 aColor;
attribute vec3 aWave; // start, duration, size
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWave;
void main() {
  float age = (uTime - aWave.x) / aWave.y;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vUv = position.xz * 2.0;
  vColor = aColor;
  vWave = aWave;
  vec3 world = aCenter + position * aWave.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWave;
void main() {
  float age = (uTime - vWave.x) / vWave.y;
  if (age < 0.0 || age > 1.0) discard;
  float u = length(vUv);
  if (u > 1.0) discard;
  float r = 1.0 - pow(1.0 - age, 3.0);
  float w = 0.035 + 0.08 * age;
  float ring = exp(-pow((u - r) / w, 2.0));
  float inner = smoothstep(r, 0.0, u) * 0.18 * (1.0 - age);
  float fade = pow(1.0 - age, 1.5);
  vec3 col = mix(vColor, vec3(1.0), 0.35 * (1.0 - age)) * (ring * 1.6 + inner) * fade;
  gl_FragColor = vec4(col, 1.0);
}
`;

const color = new Color();

export function Shockwaves({ fx }: { fx: SceneFx }) {
  const plane = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const { geometry, center, tint, wave } = useMemo(() => {
    const g = new InstancedBufferGeometry();
    g.setIndex(plane.index);
    g.setAttribute("position", plane.getAttribute("position"));
    const c = new InstancedBufferAttribute(new Float32Array(POOL * 3), 3).setUsage(DynamicDrawUsage);
    const k = new InstancedBufferAttribute(new Float32Array(POOL * 3), 3).setUsage(DynamicDrawUsage);
    const w = new InstancedBufferAttribute(new Float32Array(POOL * 3).fill(-1e4), 3).setUsage(DynamicDrawUsage);
    g.setAttribute("aCenter", c);
    g.setAttribute("aColor", k);
    g.setAttribute("aWave", w);
    g.instanceCount = POOL;
    return { geometry: g, center: c, tint: k, wave: w };
  }, [plane]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: fx.uniforms.uTime },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [fx],
  );

  useEffect(() => {
    let next = 0;
    const spawn = (event: FxEvent, size: number, duration: number, hex: string, delay = 0) => {
      const slot = next;
      next = (next + 1) % POOL;
      const p = event.node.p;
      center.setXYZ(slot, p.x, p.y, p.z);
      color.set(hex);
      tint.setXYZ(slot, color.r, color.g, color.b);
      wave.setXYZ(slot, event.at + delay, duration, size);
      center.needsUpdate = true;
      tint.needsUpdate = true;
      wave.needsUpdate = true;
    };
    return fx.on((event) => {
      const r = event.node.p.r;
      const tone = event.node.tone;
      if (event.kind === "born") {
        spawn(event, Math.max(2.2, r * 9), 1.6, tone);
        spawn(event, Math.max(1.4, r * 5), 1.1, "#ffffff", 0.12);
      } else if (event.kind === "status") {
        spawn(event, Math.max(1.8, r * 7), 1.3, tone);
      } else {
        spawn(event, Math.max(1.0, r * 4), 0.9, tone);
      }
    });
  }, [fx, center, tint, wave]);

  useEffect(
    () => () => {
      geometry.dispose();
      plane.dispose();
      material.dispose();
    },
    [geometry, plane, material],
  );

  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={8} />;
}
