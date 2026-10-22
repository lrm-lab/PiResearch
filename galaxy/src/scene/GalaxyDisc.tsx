// The galaxy disc around the core: ~18k dust points in a two-arm log spiral
// (6k on the low tier, via drawRange) over a faint spiral haze plane.
// Positions are generated once in unit space; the radius is a uniform.

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, PlaneGeometry, ShaderMaterial } from "three";
import { gauss, rng } from "../lib/math";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import { NOISE } from "./shaders/chunks";

const HIGH = 18000;
const LOW = 6000;
/** Arm pitch: tan of the spiral angle. */
const PITCH = 0.3;
const R0 = 0.05;
const GAUSS_MIN = 1e-7;

function dustGeometry(): BufferGeometry {
  // Seeded so the disc looks the same on every load.
  const rand = rng(0x9e3779b9);
  const position = new Float32Array(HIGH * 3);
  const extra = new Float32Array(HIGH * 3);
  for (let i = 0; i < HIGH; i += 1) {
    const pick = rand();
    let r: number;
    let theta: number;
    let arm = 0;
    if (pick < 0.16) {
      r = Math.abs(gauss(rand, GAUSS_MIN)) * 0.09;
      theta = rand() * Math.PI * 2;
    } else if (pick < 0.86) {
      arm = 1;
      r = R0 + Math.pow(rand(), 0.9) * 1.05;
      const base = (i % 2) * Math.PI + Math.log(r / R0) / PITCH;
      theta = base + gauss(rand, GAUSS_MIN) * (0.16 + 0.32 * r);
      r *= 1 + gauss(rand, GAUSS_MIN) * 0.05;
    } else {
      r = Math.sqrt(rand()) * 1.3;
      theta = rand() * Math.PI * 2;
    }
    const h = gauss(rand, GAUSS_MIN) * (0.008 + 0.022 * Math.min(r, 1)) * (arm ? 1 : 1.6);
    const o = i * 3;
    position[o] = r;
    position[o + 1] = theta;
    position[o + 2] = h;
    const big = rand() < 0.03 ? 2.2 : 1;
    extra[o] = (0.45 + rand() * 0.9) * big;
    extra[o + 1] = rand();
    extra[o + 2] = arm;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aExtra", new BufferAttribute(extra, 3));
  return geometry;
}

const PALETTE = /* glsl */ `
vec3 discColor(float r) {
  vec3 warm = vec3(1.0, 0.78, 0.52);
  vec3 rose = vec3(0.86, 0.48, 0.66);
  vec3 indigo = vec3(0.34, 0.38, 0.92);
  vec3 teal = vec3(0.22, 0.7, 0.72);
  vec3 c = mix(warm, rose, smoothstep(0.04, 0.3, r));
  c = mix(c, indigo, smoothstep(0.28, 0.62, r));
  return mix(c, teal, smoothstep(0.6, 1.1, r));
}
`;

const DUST_VERTEX = /* glsl */ `
${PALETTE}
uniform float uTime;
uniform float uRadius;
uniform vec2 uViewport;
attribute vec3 aExtra;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = position.x;
  float theta = position.y + uTime * 0.01;
  vec3 world = vec3(cos(theta) * r, position.z, sin(theta) * r) * uRadius;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uRadius * 0.0034 * aExtra.x;
  float px = size * projectionMatrix[1][1] * uViewport.y * 0.5 / max(-mv.z, 0.01);
  gl_PointSize = clamp(px, 1.0, 7.0 * uViewport.y / 1800.0 + 2.0);
  float twinkle = 0.72 + 0.28 * sin(uTime * (0.6 + aExtra.y * 2.2) + aExtra.y * 60.0);
  float near = smoothstep(2.5, 12.0, -mv.z);
  float coreDim = mix(0.4, 1.0, smoothstep(0.0, 0.16, r));
  float outer = 1.0 - smoothstep(0.95, 1.3, r);
  vAlpha = (0.32 + 0.3 * aExtra.z) * twinkle * near * coreDim * outer * clamp(px, 0.25, 1.0);
  vColor = discColor(r) * (1.0 + 0.6 * (1.0 - smoothstep(0.0, 0.2, r)));
}
`;

const DUST_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 4.5) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

const HAZE_VERTEX = /* glsl */ `
varying vec2 vPlane;
void main() {
  vPlane = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HAZE_FRAGMENT = /* glsl */ `
${NOISE}
${PALETTE}
uniform float uTime;
uniform float uRadius;
varying vec2 vPlane;
void main() {
  vec2 p = vPlane;
  float r = length(p);
  if (r > 1.35) discard;
  float theta = atan(p.y, p.x) - uTime * 0.01;
  float phase = theta - log(max(r, ${R0.toFixed(3)}) / ${R0.toFixed(3)}) / ${PITCH.toFixed(3)};
  float arms = pow(max(0.5 + 0.5 * cos(2.0 * phase), 0.0), 2.5);
  float n = fbm3(vec3(p * 3.2, 0.7)) * 0.5 + 0.5;
  float bulge = exp(-r * r * 60.0) * 1.4 + exp(-r * 7.0) * 0.5;
  float disc = arms * exp(-r * 1.9) * smoothstep(0.02, 0.18, r) * (0.45 + 0.9 * n);
  float edge = 1.0 - smoothstep(0.9, 1.35, r);
  vec3 col = discColor(r) * (bulge + disc * 0.75) * edge * 0.16;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function GalaxyDisc({ fx, extent }: { fx: SceneFx; extent: number }) {
  const high = useGalaxy((state) => state.effectiveQuality === "high");
  const dust = useMemo(dustGeometry, []);
  const plane = useMemo(() => new PlaneGeometry(2.7, 2.7).rotateX(-Math.PI / 2), []);
  const radius = useMemo(() => ({ value: 1 }), []);
  radius.value = extent * 1.3;

  const materials = useMemo(() => {
    const shared = { uTime: fx.uniforms.uTime, uViewport: fx.uniforms.uViewport, uRadius: radius };
    return {
      dust: new ShaderMaterial({
        uniforms: shared,
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      haze: new ShaderMaterial({
        uniforms: shared,
        vertexShader: HAZE_VERTEX,
        fragmentShader: HAZE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    };
  }, [fx, radius]);

  useEffect(() => {
    dust.setDrawRange(0, high ? HIGH : LOW);
  }, [dust, high]);

  useEffect(
    () => () => {
      dust.dispose();
      plane.dispose();
      materials.dust.dispose();
      materials.haze.dispose();
    },
    [dust, plane, materials],
  );

  return (
    <group>
      <mesh geometry={plane} material={materials.haze} scale={radius.value} frustumCulled={false} raycast={() => null} renderOrder={-5} />
      <points geometry={dust} material={materials.dust} frustumCulled={false} raycast={() => null} renderOrder={-4} />
    </group>
  );
}
