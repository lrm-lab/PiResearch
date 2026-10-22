// Deep background: a far nebula shell (fbm baked once into an equirect
// texture, then sampled by a back-side sphere) and two star layers at
// different depths so they parallax as the camera moves.

import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLRenderTarget,
} from "three";
import { rng } from "../lib/math";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import { NOISE } from "./shaders/chunks";

const SHELL_RADIUS = 1400;

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const BAKE_FRAGMENT = /* glsl */ `
${NOISE}
uniform vec3 uIndigo;
uniform vec3 uTeal;
uniform vec3 uRose;
varying vec2 vUv;
void main() {
  float lon = (vUv.x - 0.5) * 6.28318530718;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  vec3 bandN = normalize(vec3(0.3, 1.0, 0.42));
  float band = exp(-pow(abs(dot(d, bandN) * 2.4), 2.0));
  float n1 = fbm(d * 2.1) * 0.5 + 0.5;
  float n2 = fbm(d * 4.6 + vec3(3.1, 1.7, 8.2)) * 0.5 + 0.5;
  float mixer = fbm(d * 1.3 + vec3(7.0)) * 0.5 + 0.5;
  float clouds = smoothstep(0.38, 0.82, n1);
  float wisps = pow(max(n2, 0.0), 3.0);
  vec3 col = mix(uIndigo, uTeal, smoothstep(0.35, 0.68, mixer)) * (clouds * 1.1 + wisps * 1.3) * (0.3 + 1.2 * band);
  float lanes = smoothstep(0.52, 0.78, fbm(d * 6.0 + vec3(2.0)) * 0.5 + 0.5);
  col *= 1.0 - 0.65 * lanes * band;
  col += uRose * pow(max(n1 * n2, 0.0), 3.0) * band * 1.4;
  col += mix(uIndigo, uTeal, 0.5) * band * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SHELL_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SHELL_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.x, d.z) / 6.28318530718 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
  gl_FragColor = vec4(texture2D(uMap, uv).rgb, 1.0);
}
`;

const STAR_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uTwinkle;
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSpike;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float bright = step(2.35, aSize);
  vSpike = bright;
  gl_PointSize = aSize * uDpr * (1.0 + bright * 3.5);
  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 2.6) + aSeed * 80.0));
  vAlpha = tw;
  vColor = aColor;
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSpike;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  float a;
  if (vSpike > 0.5) {
    float core = exp(-d2 * 40.0) * 1.6 + exp(-d2 * 9.0) * 0.35;
    float spikes = (exp(-abs(c.x) * 38.0) + exp(-abs(c.y) * 38.0)) * pow(max(1.0 - sqrt(d2), 0.0), 2.0) * 0.8;
    a = core + spikes;
  } else {
    if (d2 > 1.0) discard;
    a = exp(-d2 * 5.0);
  }
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

const STAR_TINTS = ["#9fc3ff", "#cfe0ff", "#ffffff", "#fff2dc", "#ffd8a8", "#bfe9ff"].map((hex) => new Color(hex));

function starLayer(count: number, rMin: number, rMax: number, sMin: number, sMax: number, gain: number, seed: number): BufferGeometry {
  const rand = rng(seed);
  const position = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  const salt = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const z = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const r = rMin + (rMax - rMin) * rand();
    const o = i * 3;
    position[o] = s * Math.cos(phi) * r;
    position[o + 1] = z * r;
    position[o + 2] = s * Math.sin(phi) * r;
    const u = rand();
    size[i] = sMin + (sMax - sMin) * Math.pow(u, 3.2);
    const c = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]!;
    const lum = gain * (0.35 + 0.65 * Math.pow(rand(), 1.6));
    tint[o] = c.r * lum;
    tint[o + 1] = c.g * lum;
    tint[o + 2] = c.b * lum;
    salt[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aSize", new BufferAttribute(size, 1));
  geometry.setAttribute("aColor", new BufferAttribute(tint, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(salt, 1));
  return geometry;
}

const NEAR = 2600;
const FAR = 7000;

export function Starfield({ fx }: { fx: SceneFx }) {
  const gl = useThree((state) => state.gl);
  const high = useGalaxy((state) => state.effectiveQuality === "high");

  const target = useMemo(() => {
    const rt = new WebGLRenderTarget(high ? 2048 : 1024, high ? 1024 : 512, { type: HalfFloatType, depthBuffer: false });
    rt.texture.wrapS = RepeatWrapping;
    rt.texture.minFilter = LinearFilter;
    rt.texture.magFilter = LinearFilter;
    rt.texture.generateMipmaps = false;
    return rt;
  }, [high]);

  useLayoutEffect(() => {
    const scene = new Scene();
    const quad = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({
      uniforms: {
        uIndigo: { value: new Color("#1b1f4a").multiplyScalar(0.75) },
        uTeal: { value: new Color("#0d3b3f").multiplyScalar(0.9) },
        uRose: { value: new Color("#3a1638").multiplyScalar(0.6) },
      },
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(quad, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
  }, [gl, target]);

  const shell = useMemo(() => new SphereGeometry(SHELL_RADIUS, 64, 32), []);
  const shellMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uMap: { value: target.texture } },
        vertexShader: SHELL_VERTEX,
        fragmentShader: SHELL_FRAGMENT,
        side: BackSide,
        depthWrite: false,
      }),
    [target],
  );

  const near = useMemo(() => starLayer(NEAR, 260, 460, 0.9, 2.9, 1.0, 11), []);
  const far = useMemo(() => starLayer(FAR, 900, 1200, 0.6, 1.9, 0.75, 23), []);
  const starMaterials = useMemo(() => {
    const make = (twinkle: number) =>
      new ShaderMaterial({
        uniforms: { uTime: fx.uniforms.uTime, uDpr: fx.uniforms.uDpr, uTwinkle: { value: twinkle } },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
    return { near: make(0.45), far: make(0.2) };
  }, [fx]);

  useEffect(() => {
    near.setDrawRange(0, high ? NEAR : NEAR / 2);
    far.setDrawRange(0, high ? FAR : FAR / 2);
  }, [near, far, high]);

  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => () => shellMaterial.dispose(), [shellMaterial]);
  useEffect(
    () => () => {
      shell.dispose();
      near.dispose();
      far.dispose();
      starMaterials.near.dispose();
      starMaterials.far.dispose();
    },
    [shell, near, far, starMaterials],
  );

  return (
    <group>
      <mesh geometry={shell} material={shellMaterial} frustumCulled={false} raycast={() => null} renderOrder={-20} />
      <points geometry={far} material={starMaterials.far} frustumCulled={false} raycast={() => null} renderOrder={-19} />
      <points geometry={near} material={starMaterials.near} frustumCulled={false} raycast={() => null} renderOrder={-18} />
    </group>
  );
}
