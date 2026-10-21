// Every orbiting particle in one Points draw: tool-call satellites (2–3 tilted
// orbits per task), accretion discs of in-progress tasks, and live-call comets
// with trails. Positions are analytic in the vertex shader (no CPU per frame).

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from "three";
import { hash01 } from "../lib/space";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import { KIND_PROGRESS, type SceneGraph } from "./graph";
import { COMET_TRAIL, MAX_SATELLITES, satelliteOrbits } from "./orbits";
import { NODE_FX, ORBIT } from "./shaders/chunks";
import { COMET_FADE, type Comet } from "./useComets";

const KIND_SATELLITE = 0;
const KIND_DISC = 1;
const KIND_COMET = 2;
const KIND_THINKING = 3;

const VERTEX = /* glsl */ `
${NODE_FX}
${ORBIT}
attribute vec4 aOrbit;
attribute float aPhase;
attribute float aKind;
attribute float aTrail;
attribute vec3 aTone;
attribute float aNode;
attribute float aSize;
attribute float aIdx;
attribute vec2 aLife;
uniform float uTime;
uniform float uMotion;
uniform vec2 uViewport;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;
varying float vHead;
void main() {
  vec4 fx = aNode < 0.0 ? vec4(1.0, 1.0, 0.0, 0.0) : nodeFx(aNode);
  vec4 fx2 = aNode < 0.0 ? vec4(0.0, 0.0, -1e4, 0.0) : nodeFx2(aNode);
  float radius = aOrbit.x * fx.g;
  float theta = aPhase + aOrbit.w * uTime;
  float size = aSize;
  float alpha = 1.0;
  vec3 col = aTone;
  vec3 white = vec3(1.0, 0.97, 0.92);
  vHead = 0.0;
  if (aKind < 0.5) {
    col = mix(aTone, white, 0.35) * 1.2;
    alpha = 0.95;
    float age = uTime - fx2.z;
    if (aIdx >= fx2.x && aIdx < fx2.y && age >= 0.0 && age < 1.4) {
      float k = age / 1.4;
      float e = 1.0 - pow(1.0 - k, 3.0);
      radius *= mix(0.4, 1.0, e);
      size *= 1.0 + 3.0 * (1.0 - k);
      col = mix(white * 2.0, col, k);
      alpha = 1.4;
    }
  } else if (aKind < 1.5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 3.927);
    col = mix(white * 1.3, aTone * 1.2, smoothstep(0.0, 0.7, aTrail));
    alpha = (1.0 - 0.7 * aTrail) * (0.7 + 0.3 * pulse);
  } else {
    theta -= aTrail * ${COMET_TRAIL.toFixed(3)} * sign(aOrbit.w);
    float tail = 1.0 - aTrail;
    alpha = pow(tail, 1.5) * (aTrail < 0.01 ? 1.0 : 0.55);
    size *= aTrail < 0.01 ? 1.0 : mix(0.75, 0.25, aTrail);
    col = mix(white * 1.7, aTone * 1.2, smoothstep(0.0, 0.35, aTrail));
    if (aTrail > 0.0 && uMotion < 0.5) alpha = 0.0;
    if (aKind > 2.5) {
      float blink = 0.25 + 0.75 * smoothstep(-0.3, 0.7, sin(uTime * 2.4 + aPhase * 3.0));
      alpha *= blink * 0.8;
    }
    vHead = aTrail < 0.01 ? 1.0 : 0.0;
    float life = smoothstep(aLife.x, aLife.x + 0.6, uTime) * (1.0 - smoothstep(aLife.y, aLife.y + uFade, uTime));
    alpha *= uMotion < 0.5 ? 1.0 : life;
  }
  vec3 world = position + orbitPos(radius, aOrbit.y, aOrbit.z, theta);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = size * projectionMatrix[1][1] * uViewport.y * 0.5 / max(-mv.z, 0.01);
  float shown = clamp(px, 1.6, 64.0);
  alpha *= clamp(px / 1.6, 0.0, 1.0);
  gl_PointSize = shown;
  vColor = col;
  vAlpha = alpha * clamp(fx.r, 0.0, 1.6) * step(0.001, fx.g);
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vHead;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 9.0);
  float halo = exp(-d2 * 2.6) * (0.35 + 0.4 * vHead);
  gl_FragColor = vec4(vColor * (core + halo) * vAlpha, 1.0);
}
`;

const color = new Color();

interface Builder {
  center: number[];
  orbit: number[];
  phase: number[];
  kind: number[];
  trail: number[];
  tone: number[];
  node: number[];
  size: number[];
  idx: number[];
  life: number[];
}

function push(
  b: Builder,
  center: { x: number; y: number; z: number },
  orbit: [number, number, number, number],
  phase: number,
  kind: number,
  trail: number,
  tone: Color,
  node: number,
  size: number,
  idx: number,
  life: [number, number],
) {
  b.center.push(center.x, center.y, center.z);
  b.orbit.push(...orbit);
  b.phase.push(phase);
  b.kind.push(kind);
  b.trail.push(trail);
  b.tone.push(tone.r, tone.g, tone.b);
  b.node.push(node);
  b.size.push(size);
  b.idx.push(idx);
  b.life.push(...life);
}

function buildGeometry(graph: SceneGraph, comets: Comet[], high: boolean): BufferGeometry {
  const b: Builder = { center: [], orbit: [], phase: [], kind: [], trail: [], tone: [], node: [], size: [], idx: [], life: [] };
  const never: [number, number] = [-1e4, 1e9];
  for (const task of graph.nodes) {
    if (task.node.goal) continue;
    color.set(task.kind === 3 ? "#9aa0a8" : task.tone);
    const center = task.p;
    const count = Math.min(task.node.step_count ?? 0, MAX_SATELLITES);
    if (count > 0) {
      const orbits = satelliteOrbits(task.id, task.p.r, count);
      const rings = orbits.length;
      for (let i = 0; i < count; i += 1) {
        const k = i % rings;
        const o = orbits[k]!;
        const slot = Math.floor(i / rings);
        const perRing = Math.ceil((count - k) / rings);
        const phase = (slot / perRing) * Math.PI * 2 + (hash01(`${task.id}|sat|${i}`) - 0.5) * 0.35;
        const size = 0.04 + 0.018 * hash01(`${task.id}|sz|${i}`);
        push(b, center, [o.radius, o.incl, o.node, o.speed], phase, KIND_SATELLITE, 0, color, task.i, size, i, never);
      }
    }
    if (task.kind === KIND_PROGRESS) {
      const n = high ? 280 : 110;
      const inner = task.p.r * 1.3;
      for (let i = 0; i < n; i += 1) {
        const u = hash01(`${task.id}|disc|${i}`);
        const radius = inner + task.p.r * 1.6 * Math.pow(u, 1.35);
        const speed = 1.7 * Math.pow(inner / radius, 1.5);
        const wobble = (hash01(`${task.id}|wob|${i}`) - 0.5) * 0.06;
        push(
          b,
          center,
          [radius, task.tilt.incl + wobble, task.tilt.node, speed],
          hash01(`${task.id}|dph|${i}`) * Math.PI * 2,
          KIND_DISC,
          u,
          color,
          task.i,
          0.026 + 0.022 * hash01(`${task.id}|dsz|${i}`),
          i,
          never,
        );
      }
    }
  }
  const trail = high ? 64 : 32;
  for (const comet of comets) {
    color.set(comet.tone);
    const o = comet.orbit;
    const kind = comet.thinking ? KIND_THINKING : KIND_COMET;
    const head = comet.thinking ? 0.085 : 0.11;
    for (let j = 0; j < trail; j += 1) {
      push(
        b,
        comet.center,
        [o.radius, o.incl, o.node, o.speed],
        o.phase,
        kind,
        j / (trail - 1),
        color,
        comet.nodeIndex,
        head,
        j,
        [comet.bornAt, Number.isFinite(comet.dieAt) ? comet.dieAt : 1e9],
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(b.center), 3));
  geometry.setAttribute("aOrbit", new BufferAttribute(new Float32Array(b.orbit), 4));
  geometry.setAttribute("aPhase", new BufferAttribute(new Float32Array(b.phase), 1));
  geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(b.kind), 1));
  geometry.setAttribute("aTrail", new BufferAttribute(new Float32Array(b.trail), 1));
  geometry.setAttribute("aTone", new BufferAttribute(new Float32Array(b.tone), 3));
  geometry.setAttribute("aNode", new BufferAttribute(new Float32Array(b.node), 1));
  geometry.setAttribute("aSize", new BufferAttribute(new Float32Array(b.size), 1));
  geometry.setAttribute("aIdx", new BufferAttribute(new Float32Array(b.idx), 1));
  geometry.setAttribute("aLife", new BufferAttribute(new Float32Array(b.life), 2));
  return geometry;
}

export function Particles({ graph, fx, comets }: { graph: SceneGraph; fx: SceneFx; comets: Comet[] }) {
  const high = useGalaxy((state) => state.effectiveQuality === "high");
  const geometry = useMemo(() => buildGeometry(graph, comets, high), [graph, comets, high]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: fx.uniforms.uTime,
          uMotion: fx.uniforms.uMotion,
          uViewport: fx.uniforms.uViewport,
          uNodeTex: fx.uniforms.uNodeTex,
          uFade: { value: COMET_FADE },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [fx],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={7} />;
}

