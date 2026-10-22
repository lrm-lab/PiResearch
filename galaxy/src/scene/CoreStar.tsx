// The goal as a core star: plasma surface, corona with rays, anamorphic flare,
// and an equatorial ring of light while the goal is planning or finalising.
// Renders at the origin even without a goal node (empty / missing graph).

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, MathUtils, type Mesh, PlaneGeometry, RingGeometry, ShaderMaterial, SphereGeometry } from "three";
import { toneColor } from "../lib/palette";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import type { SceneGraph } from "./graph";
import { BILLBOARD, NODE_FX, NOISE } from "./shaders/chunks";

const CORE_FX = /* glsl */ `
${NODE_FX}
uniform float uIdx;
vec4 coreFx() { return uIdx < 0.0 ? vec4(1.0, 1.0, 0.0, 0.0) : nodeFx(uIdx); }
`;

const SURFACE_VERTEX = /* glsl */ `
${CORE_FX}
uniform float uRadius;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vObj;
varying vec4 vFx;
void main() {
  vec4 fx = coreFx();
  vec3 world = position * uRadius * fx.g * (1.0 + 0.05 * fx.a);
  vN = normal;
  vObj = position;
  vWorld = world;
  vFx = fx;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uLive;
uniform float uGlare;
uniform vec3 uTone;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vObj;
varying vec4 vFx;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  vec3 p = normalize(vObj);
  float t = uTime * 0.045;
  vec3 w = vec3(fbm3(p * 1.7 + vec3(0.0, t, 0.0)), fbm3(p * 1.7 + vec3(5.2, -t, 1.3)), fbm3(p * 1.7 + vec3(2.1, 3.3, t)));
  float n = fbm(p * 3.1 + w * 1.5 + vec3(0.0, t * 2.0, 0.0));
  float gran = snoise(p * 16.0 + w * 2.5 + vec3(t * 4.0));
  float heat = clamp(0.5 + 0.55 * n + 0.12 * gran, 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.97, 0.9);
  vec3 col = mix(uTone * 0.5, uTone * 1.5, smoothstep(0.15, 0.6, heat));
  col = mix(col, hot * 1.6, smoothstep(0.5, 0.95, heat) * (0.3 + 0.7 * mu));
  col = mix(col, hot * 2.1, pow(mu, 3.2) * 0.6);
  col += uTone * pow(1.0 - mu, 2.0) * 1.6;
  float pulse = 1.0 + uLive * 0.22 * (0.5 + 0.5 * sin(uTime * 3.927));
  col *= pulse * vFx.r * (1.0 + 0.25 * vFx.a) * mix(0.62, 1.0, uGlare);
  col += hot * vFx.b * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SPRITE_VERTEX = /* glsl */ `
${CORE_FX}
${BILLBOARD}
uniform float uRadius;
uniform vec2 uSize;
uniform float uLift;
varying vec2 vUv;
varying vec4 vFx;
void main() {
  vec4 fx = coreFx();
  vUv = position.xy * 2.0;
  vFx = fx;
  gl_Position = billboard(vec3(0.0), position.xy, uSize * uRadius * fx.g, uLift * uRadius);
}
`;

const CORONA_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uLive;
uniform float uGlare;
uniform vec3 uTone;
uniform vec2 uSize;
varying vec2 vUv;
varying vec4 vFx;
void main() {
  float u = length(vUv);
  if (u > 1.0) discard;
  float d = u * uSize.x;
  float x = max(d - 0.97, 0.0);
  float a = atan(vUv.y, vUv.x);
  float t = uTime;
  float rays = snoise(vec3(cos(a + t * 0.012) * 3.2, sin(a + t * 0.012) * 3.2, t * 0.07)) * 0.5 + 0.5;
  float fine = snoise(vec3(cos(a - t * 0.02) * 9.0, sin(a - t * 0.02) * 9.0, t * 0.15)) * 0.5 + 0.5;
  float streamers = pow(max(rays, 0.0), 3.0) * 1.1 + pow(max(fine, 0.0), 4.0) * 0.5;
  vec3 hot = vec3(1.0, 0.97, 0.92);
  float glow = exp(-x * 1.25);
  float inner = exp(-x * 5.5);
  vec3 col = uTone * (glow * 0.5 + streamers * exp(-x * 0.8) * 0.6) + hot * inner * 0.8;
  float pulse = 1.0 + uLive * 0.3 * (0.5 + 0.5 * sin(t * 3.927));
  col *= pulse * vFx.r * smoothstep(1.0, 0.6, u) * uGlare;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FLARE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLive;
uniform float uGlare;
uniform vec3 uTone;
varying vec2 vUv;
varying vec4 vFx;
void main() {
  vec2 q = vUv;
  float streak = exp(-pow(abs(q.y * 7.0), 2.0)) * pow(max(1.0 - abs(q.x), 0.0), 2.4);
  float thin = exp(-pow(abs(q.y * 26.0), 2.0)) * pow(max(1.0 - abs(q.x), 0.0), 1.2);
  float core = exp(-dot(q * vec2(4.0, 9.0), q * vec2(4.0, 9.0)));
  float shimmer = 0.85 + 0.15 * sin(uTime * 1.3);
  vec3 hot = vec3(1.0, 0.98, 0.95);
  vec3 col = mix(uTone, hot, 0.4) * streak * 0.3 + hot * thin * 0.42 + hot * core * 0.3;
  col *= shimmer * (1.0 + 0.25 * uLive) * vFx.r * uGlare * uGlare;
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uActivity;
uniform vec3 uTone;
uniform vec2 uBand;
varying vec3 vLocal;
void main() {
  float r = length(vLocal.xy);
  float k = (r - uBand.x) / (uBand.y - uBand.x);
  float a = atan(vLocal.y, vLocal.x);
  float profile = exp(-pow(abs((k - 0.5) * 4.6), 2.0));
  float thin = exp(-pow(abs((k - 0.5) * 18.0), 2.0));
  float arc = pow(max(0.5 + 0.5 * cos(a - uTime * 1.25), 0.0), 14.0);
  float arc2 = pow(max(0.5 + 0.5 * cos(a + 3.14159 - uTime * 1.25), 0.0), 30.0) * 0.5;
  float ripples = pow(max(0.5 + 0.5 * cos(a * 18.0 - uTime * 4.0), 0.0), 6.0) * 0.18;
  vec3 hot = vec3(1.0, 0.98, 0.95);
  vec3 col = uTone * profile * (0.18 + ripples) + mix(uTone, hot, 0.6) * (profile * 0.6 + thin * 1.6) * (arc + arc2);
  gl_FragColor = vec4(col * uActivity, 1.0);
}
`;

/** Core glare gain at and below GLARE_NEAR radii of camera distance. */
const GLARE_MIN = 0.32;
const GLARE_NEAR = 8;
const GLARE_FAR = 20;

export function CoreStar({ graph, fx }: { graph: SceneGraph; fx: SceneFx }) {
  const select = useGalaxy((state) => state.select);
  const hover = useGalaxy((state) => state.hover);
  const gl = useThree((state) => state.gl);
  const goal = graph.goal;
  const radius = goal ? goal.p.r : 0.8;
  const tone = toneColor(goal?.node.tone ?? "origin");

  const shared = useMemo(
    () => ({
      uIdx: { value: -1 },
      uRadius: { value: 1 },
      uTone: { value: new Color() },
      uLive: { value: 0 },
      uGlare: { value: 1 },
    }),
    [],
  );
  shared.uIdx.value = goal ? goal.i : -1;
  shared.uRadius.value = radius;
  shared.uTone.value.set(tone);

  const sphere = useMemo(() => new SphereGeometry(1, 72, 48), []);
  const quad = useMemo(() => new PlaneGeometry(1, 1), []);
  const ring = useMemo(() => new RingGeometry(1.55, 2.25, 160, 1), []);

  const materials = useMemo(() => {
    const base = { uTime: fx.uniforms.uTime, uNodeTex: fx.uniforms.uNodeTex, ...shared };
    const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const;
    return {
      surface: new ShaderMaterial({ uniforms: base, vertexShader: SURFACE_VERTEX, fragmentShader: SURFACE_FRAGMENT }),
      corona: new ShaderMaterial({
        uniforms: { ...base, uSize: { value: [4.2, 4.2] }, uLift: { value: 0 } },
        vertexShader: SPRITE_VERTEX,
        fragmentShader: CORONA_FRAGMENT,
        ...additive,
      }),
      flare: new ShaderMaterial({
        uniforms: { ...base, uSize: { value: [11, 1.6] }, uLift: { value: 1.08 } },
        vertexShader: SPRITE_VERTEX,
        fragmentShader: FLARE_FRAGMENT,
        ...additive,
      }),
      ring: new ShaderMaterial({
        uniforms: { uTime: fx.uniforms.uTime, uTone: shared.uTone, uActivity: { value: 0 }, uBand: { value: [1.55, 2.25] } },
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        side: DoubleSide,
        ...additive,
      }),
    };
  }, [fx, shared]);

  useEffect(
    () => () => {
      sphere.dispose();
      quad.dispose();
      ring.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
    [sphere, quad, ring, materials],
  );

  const ringRef = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    shared.uLive.value = fx.live;
    // Glare falls off as the camera closes in (a goal focus sits ~14 radii
    // away) so a close view stays readable instead of a white bloom.
    const near = camera.position.length() / Math.max(radius, 0.05);
    fx.glare = GLARE_MIN + (1 - GLARE_MIN) * MathUtils.smoothstep(near, GLARE_NEAR, GLARE_FAR);
    shared.uGlare.value = fx.glare;
    const activity = materials.ring.uniforms.uActivity;
    if (activity) activity.value = fx.activity;
    if (ringRef.current) ringRef.current.visible = fx.activity > 0.005;
  });

  return (
    <group>
      <mesh
        geometry={sphere}
        material={materials.surface}
        frustumCulled={false}
        renderOrder={1}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!goal || event.delta > 6) return;
          event.stopPropagation();
          select(goal.id);
        }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          if (!goal) return;
          event.stopPropagation();
          gl.domElement.style.cursor = "pointer";
          hover(goal.id);
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
          hover(null);
        }}
      />
      <mesh geometry={quad} material={materials.corona} frustumCulled={false} raycast={() => null} renderOrder={5} />
      <mesh geometry={quad} material={materials.flare} frustumCulled={false} raycast={() => null} renderOrder={6} />
      <mesh
        ref={ringRef}
        geometry={ring}
        material={materials.ring}
        scale={radius}
        rotation={[-Math.PI / 2 + 0.22, 0, 0.12]}
        raycast={() => null}
        renderOrder={5}
      />
    </group>
  );
}
