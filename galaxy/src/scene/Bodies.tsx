// Task bodies: one instanced sphere draw (status looks in one shader), one
// instanced billboard draw for halos / nebulae / coronas, and an invisible
// instanced hit mesh (a little larger than the bodies) for picking.

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { ERROR_RED } from "../lib/palette";
import { useGalaxy } from "../store";
import type { SceneFx } from "./fx";
import { KIND_CANCELLED, type SceneGraph, type SceneNode } from "./graph";
import { tiltNormal } from "./orbits";
import { BILLBOARD, NODE_FX, NOISE } from "./shaders/chunks";

/** Sphere radius as a fraction of the layout radius, by kind. */
const BODY_SCALE = [0.42, 1, 0.9, 0.8];
/** Billboard half-size in sphere radii, by kind. */
const GLOW_SPAN = [10, 3.6, 5.6, 2.6];

const color = new Color();

const BODY_VERTEX = /* glsl */ `
${NODE_FX}
attribute vec3 aOffset;
attribute float aRadius;
attribute vec3 aTone;
attribute float aKind;
attribute float aSeed;
attribute float aNode;
attribute float aErr;
attribute vec3 aAxis;
uniform float uTime;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vTone;
varying vec3 vAxis;
varying float vKind;
varying float vSeed;
varying float vErr;
varying vec4 vFx;
void main() {
  vec4 fx = nodeFx(aNode);
  float s = aRadius * fx.g * (1.0 + 0.08 * fx.a);
  if (aKind < 0.5) s *= 1.0 + 0.08 * sin(uTime * 1.0472 + aSeed * 6.283);
  vec3 world = aOffset + position * s;
  vN = normal;
  vObj = position;
  vWorld = world;
  vTone = aTone;
  vAxis = aAxis;
  vKind = aKind;
  vSeed = aSeed;
  vErr = aErr;
  vFx = fx;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const BODY_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
uniform vec3 uErrColor;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vTone;
varying vec3 vAxis;
varying float vKind;
varying float vSeed;
varying float vErr;
varying vec4 vFx;

float cracks(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + hash33(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - mu;
  vec3 p = normalize(vObj);
  vec3 white = vec3(1.0, 0.97, 0.92);
  float t = uTime;
  vec3 col;
  if (vKind < 0.5) {
    // open: tiny protostar core, breathing
    float breath = 0.75 + 0.25 * sin(t * 1.0472 + vSeed * 6.283);
    col = mix(vTone * 0.7, white * 1.15, pow(mu, 2.0)) * breath + vTone * pow(fres, 2.0) * 0.6;
  } else if (vKind < 1.5) {
    // in progress: accretion vortex around the disc axis
    vec3 ax = normalize(vAxis);
    vec3 e1 = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(ax, e1);
    float lat = dot(p, ax);
    float lon = atan(dot(p, e2), dot(p, e1));
    float polar = acos(clamp(abs(lat), 0.0, 1.0));
    float warp = fbm3(p * 3.0 + vec3(0.0, t * 0.12, vSeed * 9.0));
    float swirl = lon * 2.0 + log(polar + 0.06) * 3.2 * sign(lat) + t * 1.7 + warp * 1.6;
    float arms = 0.5 + 0.5 * sin(swirl);
    float bands = smoothstep(0.3, 0.95, arms + warp * 0.3);
    float fine = 0.5 + 0.5 * sin(swirl * 3.0 - t * 0.8);
    vec3 dark = vTone * 0.05;
    vec3 bright = mix(vTone * 0.95, white, 0.18);
    col = mix(dark, bright, bands) * (0.75 + 0.35 * fine);
    col += mix(vTone, white, 0.5) * pow(abs(lat), 26.0) * 0.8;
    float pulse = 0.5 + 0.5 * sin(t * 3.927 + vSeed * 6.283);
    col *= 0.78 + 0.32 * pulse;
    col += vTone * pow(fres, 2.6) * (0.7 + 0.9 * pulse);
  } else if (vKind < 2.5) {
    // resolved: stable glowing star with soft granulation
    float g = snoise(p * 5.5 + vec3(t * 0.07, 0.0, vSeed * 13.0)) * 0.5 + 0.5;
    float tw = 1.0 + 0.06 * sin(t * 2.3 + vSeed * 40.0);
    col = mix(vTone * 0.62, mix(vTone, white, 0.5) * 1.18, pow(mu, 1.4)) * (0.86 + 0.24 * g) * tw;
    col += vTone * pow(fres, 2.2) * 0.55;
  } else {
    // cancelled: cooled grey ember with faint glowing cracks
    vec3 q = p * 3.4 + vSeed * 7.0;
    float c = cracks(q);
    float base = 0.13 + 0.06 * snoise(q * 1.7);
    col = vec3(base) * (0.55 + 0.45 * mu);
    float line = 1.0 - smoothstep(0.0, 0.07, c);
    col += vec3(1.0, 0.42, 0.2) * line * 0.38;
    col += vec3(0.55, 0.57, 0.6) * pow(fres, 3.0) * 0.3;
  }
  if (vErr > 0.5) {
    float flick = 0.55 + 0.45 * sin(t * 6.981) + 0.3 * (hash11(floor(t * 16.0) + vSeed * 91.0) - 0.5);
    col += uErrColor * pow(fres, 1.5) * flick * 2.6;
  }
  float sel = clamp(vFx.r - 1.0, 0.0, 1.0);
  col *= min(vFx.r, 1.0) * (1.0 + 0.25 * vFx.a);
  col += vTone * pow(fres, 2.0) * (sel * 1.6 + vFx.a * 0.5);
  col += mix(vTone, white, 0.5) * vFx.b * 1.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

const GLOW_VERTEX = /* glsl */ `
${NODE_FX}
${BILLBOARD}
attribute vec3 aOffset;
attribute float aRadius;
attribute float aSpan;
attribute vec3 aTone;
attribute float aKind;
attribute float aSeed;
attribute float aNode;
attribute float aErr;
varying vec2 vUv;
varying float vSpan;
varying vec3 vTone;
varying float vKind;
varying float vSeed;
varying float vErr;
varying vec4 vFx;
void main() {
  vec4 fx = nodeFx(aNode);
  float half_ = aRadius * aSpan * max(fx.g, 0.0) * (0.8 + 0.2 * min(fx.r, 1.5)) * (1.0 + 0.12 * fx.a);
  vUv = position.xy * 2.0;
  vSpan = aSpan;
  vTone = aTone;
  vKind = aKind;
  vSeed = aSeed;
  vErr = aErr;
  vFx = fx;
  gl_Position = billboard(aOffset, position.xy, vec2(half_), 0.0);
}
`;

const GLOW_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
uniform vec3 uErrColor;
varying vec2 vUv;
varying float vSpan;
varying vec3 vTone;
varying float vKind;
varying float vSeed;
varying float vErr;
varying vec4 vFx;
void main() {
  float u = length(vUv);
  if (u > 1.0) discard;
  float d = u * vSpan;
  float edge = smoothstep(1.0, 0.72, u);
  float a = atan(vUv.y, vUv.x);
  float t = uTime;
  vec3 white = vec3(1.0, 0.97, 0.92);
  vec3 col = vec3(0.0);
  if (vKind < 0.5) {
    // open: soft noise nebula in the tone colour, breathing
    float breath = 0.78 + 0.22 * sin(t * 1.0472 + vSeed * 6.283);
    float n = fbm3(vec3(vUv * 2.1, vSeed * 17.0 + t * 0.035));
    float n2 = snoise(vec3(vUv * 4.6 + n, vSeed * 5.0 - t * 0.05));
    float cloud = smoothstep(-0.3, 0.7, n + 0.3 * n2) * exp(-u * u * 4.0);
    col = vTone * cloud * 0.5 * breath;
    col += vTone * exp(-u * u * 16.0) * 0.22 * breath;
    col += white * exp(-d * d * 0.7) * 0.35 * breath;
  } else if (vKind < 1.5) {
    // in progress: pulsing rim light
    float pulse = 0.5 + 0.5 * sin(t * 3.927 + vSeed * 6.283);
    float rim = exp(-pow((d - 1.03) * 7.0, 2.0));
    float halo = exp(-max(d - 1.0, 0.0) * 1.8);
    col = vTone * (rim * (0.45 + 0.6 * pulse) + halo * (0.16 + 0.16 * pulse));
  } else if (vKind < 2.5) {
    // resolved: soft corona with faint rays, twinkle
    float tw = 0.9 + 0.08 * sin(t * 2.1 + vSeed * 31.0) + 0.05 * sin(t * 5.3 + vSeed * 11.0);
    float x = max(d - 0.95, 0.0);
    float glow = exp(-x * 1.45);
    float streak = snoise(vec3(cos(a) * 2.5, sin(a) * 2.5, t * 0.1 + vSeed * 9.0)) * 0.5 + 0.5;
    float rays = pow(abs(cos(a * 2.0 + vSeed * 6.283)), 70.0) * exp(-x * 0.6) * 0.65;
    rays += pow(abs(cos(a * 2.0 + vSeed * 6.283 + 0.785)), 110.0) * exp(-x * 1.0) * 0.3;
    col = mix(vTone, white, 0.12) * (glow * 0.34 * (0.75 + 0.5 * streak) + rays * 0.45 * tw) * tw;
  } else {
    col = vec3(0.42, 0.40, 0.38) * exp(-max(d - 1.0, 0.0) * 3.0) * 0.2;
  }
  if (vErr > 0.5) {
    float flick = 0.55 + 0.45 * sin(t * 6.981) + 0.3 * (hash11(floor(t * 16.0) + vSeed * 91.0) - 0.5);
    float ringD = vKind < 0.5 ? 2.6 : 1.2;
    col += uErrColor * exp(-pow((d - ringD) * 5.0, 2.0)) * flick * 1.2;
    col += uErrColor * exp(-max(d - ringD + 0.2, 0.0) * 2.4) * 0.22 * flick;
  }
  float sel = clamp(vFx.r - 1.0, 0.0, 1.0);
  col *= min(vFx.r, 1.0) * (1.0 + 0.5 * vFx.a + 0.9 * sel);
  col += vTone * exp(-pow((d - 1.35 - 0.1 * sin(t * 2.0)) * 7.0, 2.0)) * sel * 0.7;
  float f = vFx.b;
  float ring = exp(-pow((u - (1.0 - f) * 0.95) * 9.0, 2.0));
  col += mix(vTone, white, 0.55) * f * (exp(-u * u * 6.0) * 1.2 + ring * 0.9);
  gl_FragColor = vec4(col * edge, 1.0);
}
`;

function bodyGeometry(base: BufferGeometry, tasks: SceneNode[], spans: boolean): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  if (base.getAttribute("normal")) geometry.setAttribute("normal", base.getAttribute("normal"));
  const n = tasks.length;
  const offset = new Float32Array(n * 3);
  const radius = new Float32Array(n);
  const span = new Float32Array(n);
  const tone = new Float32Array(n * 3);
  const kind = new Float32Array(n);
  const seed = new Float32Array(n);
  const node = new Float32Array(n);
  const err = new Float32Array(n);
  const axis = new Float32Array(n * 3);
  tasks.forEach((task, j) => {
    offset.set([task.p.x, task.p.y, task.p.z], j * 3);
    radius[j] = task.p.r * (BODY_SCALE[task.kind] ?? 1);
    span[j] = GLOW_SPAN[task.kind] ?? 3;
    color.set(task.kind === KIND_CANCELLED ? "#8a8f98" : task.tone);
    tone.set([color.r, color.g, color.b], j * 3);
    kind[j] = task.kind;
    seed[j] = task.seed;
    node[j] = task.i;
    err[j] = task.err ? 1 : 0;
    axis.set(tiltNormal(task.tilt), j * 3);
  });
  geometry.setAttribute("aOffset", new InstancedBufferAttribute(offset, 3));
  geometry.setAttribute("aRadius", new InstancedBufferAttribute(radius, 1));
  if (spans) geometry.setAttribute("aSpan", new InstancedBufferAttribute(span, 1));
  geometry.setAttribute("aTone", new InstancedBufferAttribute(tone, 3));
  geometry.setAttribute("aKind", new InstancedBufferAttribute(kind, 1));
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
  geometry.setAttribute("aNode", new InstancedBufferAttribute(node, 1));
  geometry.setAttribute("aErr", new InstancedBufferAttribute(err, 1));
  geometry.setAttribute("aAxis", new InstancedBufferAttribute(axis, 3));
  geometry.instanceCount = n;
  return geometry;
}

const matrix = new Matrix4();

export function Bodies({ graph, fx }: { graph: SceneGraph; fx: SceneFx }) {
  const select = useGalaxy((state) => state.select);
  const hover = useGalaxy((state) => state.hover);
  const gl = useThree((state) => state.gl);
  const tasks = useMemo(() => graph.nodes.filter((node) => !node.node.goal), [graph]);

  const sphere = useMemo(() => new SphereGeometry(1, 40, 28), []);
  const quad = useMemo(() => new PlaneGeometry(1, 1), []);
  const hitSphere = useMemo(() => new SphereGeometry(1, 12, 8), []);
  const hitMaterial = useMemo(() => new MeshBasicMaterial({ visible: false }), []);

  const bodyMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: fx.uniforms.uTime, uNodeTex: fx.uniforms.uNodeTex, uErrColor: { value: new Color(ERROR_RED) } },
        vertexShader: BODY_VERTEX,
        fragmentShader: BODY_FRAGMENT,
      }),
    [fx],
  );
  const glowMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: fx.uniforms.uTime, uNodeTex: fx.uniforms.uNodeTex, uErrColor: { value: new Color(ERROR_RED) } },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [fx],
  );

  const bodyGeo = useMemo(() => bodyGeometry(sphere, tasks, false), [sphere, tasks]);
  const glowGeo = useMemo(() => bodyGeometry(quad, tasks, true), [quad, tasks]);
  const hits = useMemo(() => {
    const mesh = new InstancedMesh(hitSphere, hitMaterial, Math.max(1, tasks.length));
    tasks.forEach((task, j) => {
      const r = Math.max(task.p.r * 1.3, 0.3);
      matrix.makeScale(r, r, r).setPosition(task.p.x, task.p.y, task.p.z);
      mesh.setMatrixAt(j, matrix);
    });
    mesh.count = tasks.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [hitSphere, hitMaterial, tasks]);

  useEffect(() => () => bodyGeo.dispose(), [bodyGeo]);
  useEffect(() => () => glowGeo.dispose(), [glowGeo]);
  useEffect(() => () => hits.dispose(), [hits]);
  useEffect(
    () => () => {
      sphere.dispose();
      quad.dispose();
      hitSphere.dispose();
      hitMaterial.dispose();
      bodyMaterial.dispose();
      glowMaterial.dispose();
    },
    [sphere, quad, hitSphere, hitMaterial, bodyMaterial, glowMaterial],
  );

  const idAt = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId === undefined ? null : (tasks[event.instanceId]?.id ?? null);

  return (
    <group>
      <mesh geometry={bodyGeo} material={bodyMaterial} frustumCulled={false} raycast={() => null} renderOrder={1} />
      <mesh geometry={glowGeo} material={glowMaterial} frustumCulled={false} raycast={() => null} renderOrder={4} />
      <primitive
        object={hits}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          const id = idAt(event);
          if (!id || event.delta > 6) return;
          event.stopPropagation();
          select(id);
        }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          const id = idAt(event);
          if (!id) return;
          event.stopPropagation();
          gl.domElement.style.cursor = "pointer";
          hover(id);
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
          hover(null);
        }}
      />
    </group>
  );
}

