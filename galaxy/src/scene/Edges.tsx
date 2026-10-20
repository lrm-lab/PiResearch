// All relations in one instanced draw: a screen-space ribbon template (t, side)
// bent along each edge's quadratic Bezier in the vertex shader, with a soft
// glow profile and a per-relation look in the fragment shader.

import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
} from "three";
import type { SceneFx } from "./fx";
import type { SceneGraph } from "./graph";
import { NODE_FX, NOISE } from "./shaders/chunks";

const SEGMENTS = 72;

const VERTEX = /* glsl */ `
${NODE_FX}
uniform highp sampler2D uEdgeTex;
uniform float uTime;
uniform float uDpr;
uniform vec2 uViewport;
attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aColor;
attribute vec3 aPerp;
attribute float aRel;
attribute float aSeed;
attribute float aEdge;
attribute float aLen;
attribute vec2 aEnds;
varying float vT;
varying float vSide;
varying float vEmph;
varying float vRel;
varying float vSeed;
varying float vLen;
varying float vGrow;
varying vec3 vColor;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

vec3 bez(float t) {
  float u = 1.0 - t;
  return u * u * aP0 + 2.0 * u * t * aP1 + t * t * aP2;
}

float jag(float t, float salt) {
  float k = t * 18.0;
  float i = floor(k);
  float tick = floor(uTime * 8.0);
  float a = h11(i * 1.37 + aSeed * 91.0 + tick * 0.73 + salt) - 0.5;
  float b = h11((i + 1.0) * 1.37 + aSeed * 91.0 + tick * 0.73 + salt) - 0.5;
  return mix(a, b, fract(k)) * sin(3.14159 * t);
}

vec3 at(float t) {
  vec3 p = bez(t);
  if (aRel > 3.5) {
    float amp = min(aLen * 0.045, 0.32);
    p += aPerp * jag(t, 0.0) * amp + vec3(0.0, 1.0, 0.0) * jag(t, 5.3) * amp * 0.6;
  }
  return p;
}

void main() {
  float t = position.x;
  float side = position.y;
  float dt = 1.0 / ${SEGMENTS.toFixed(1)};
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 c = vp * vec4(at(t), 1.0);
  vec4 ca = vp * vec4(at(max(t - dt, 0.0)), 1.0);
  vec4 cb = vp * vec4(at(min(t + dt, 1.0)), 1.0);
  float aspect = uViewport.x / max(uViewport.y, 1.0);
  vec2 sa = ca.xy / max(abs(ca.w), 1e-4) * vec2(aspect, 1.0);
  vec2 sb = cb.xy / max(abs(cb.w), 1e-4) * vec2(aspect, 1.0);
  vec2 dir = sb - sa;
  dir = length(dir) < 1e-6 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 nrm = vec2(-dir.y, dir.x);
  float emph = texelFetch(uEdgeTex, ivec2(int(aEdge + 0.5), 0), 0).r;
  const float W[5] = float[5](3.6, 5.0, 6.2, 4.6, 5.4);
  float halfPx = W[int(aRel + 0.5)] * uDpr * (0.7 + 0.35 * clamp(emph, 0.0, 1.8));
  vec2 off = nrm * side * halfPx * 2.0 / max(uViewport.y, 1.0);
  off.x /= aspect;
  c.xy += off * c.w;
  gl_Position = c;
  vT = t;
  vSide = side;
  vEmph = emph;
  vRel = aRel;
  vSeed = aSeed;
  vLen = aLen;
  vColor = aColor;
  vGrow = min(nodeFx(aEnds.x).g, nodeFx(aEnds.y).g);
}
`;

const FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime;
varying float vT;
varying float vSide;
varying float vEmph;
varying float vRel;
varying float vSeed;
varying float vLen;
varying float vGrow;
varying vec3 vColor;
void main() {
  float t = vT;
  if (t > vGrow) discard;
  float d = abs(vSide);
  float core = exp(-d * d * 26.0);
  float glow = exp(-d * d * 4.0) * 0.42;
  float prof = core + glow;
  float T = uTime;
  float L = max(vLen, 0.1);
  vec3 col = vColor;
  vec3 white = vec3(1.0, 0.98, 0.95);
  float I;
  if (vRel < 0.5) {
    // parent: faint gravity arc with a flow pulse parent -> child
    float period = 2.6 + L * 0.12;
    float h = fract(T / period + vSeed) * 1.2 - 0.1;
    float pulse = exp(-pow((t - h) * L / 0.5, 2.0));
    I = 0.22 + pulse * 1.0;
    col = mix(col, white, pulse * 0.25);
  } else if (vRel < 1.5) {
    // audit / fusion: scanning beam, bright segment sweeping reviewer -> target every 2.4 s
    float h = fract(T / 2.4 + vSeed) * 1.25 - 0.05;
    float behind = h - t;
    float sweep = behind >= 0.0 ? exp(-behind * L / 1.5) : 0.0;
    float head = exp(-pow((t - h) * L / 0.12, 2.0));
    float scan = 0.5 + 0.5 * sin(t * L * 10.0 - T * 7.0);
    I = 0.26 + 0.1 * scan + sweep * 0.85 + head * 1.7;
    col = mix(col, white, head * 0.6);
  } else if (vRel < 2.5) {
    // support: solid gold filament with shimmer and sparkles
    float sh = snoise(vec3(t * L * 1.2 - T * 0.55, vSeed * 20.0, T * 0.22));
    float sparkle = pow(max(snoise(vec3(t * L * 5.0, vSeed * 7.0, T * 1.3)), 0.0), 5.0) * 2.6;
    I = 0.62 + 0.2 * sh + sparkle * 0.7;
    prof = core * 1.1 + glow * 1.3;
    col = mix(col, white, sparkle * 0.25);
  } else if (vRel < 3.5) {
    // challenge: high violet arc with a travelling comet and trail
    float h = fract(T / 3.2 + vSeed) * 1.2 - 0.05;
    float behind = h - t;
    float trail = behind >= 0.0 ? exp(-behind * L / 2.4) : 0.0;
    float head = exp(-pow((t - h) * L / 0.14, 2.0));
    I = 0.2 + trail * 0.75 + head * 2.5;
    prof = core + glow * (1.0 + head * 1.5);
    col = mix(col, white, head * 0.55);
  } else {
    // error: jagged red line (vertex displaced), pulsing with crackles
    float pulse = 0.5 + 0.5 * sin(T * 5.236 + vSeed * 6.0);
    float crackle = step(0.84, hash11(floor(t * 28.0) + floor(T * 12.0) * 3.1 + vSeed * 17.0));
    I = 0.32 + 0.55 * pulse + crackle * 0.7;
  }
  float ends = smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.97, t);
  // Emphasis above 1 widens (vertex) and adds glow instead of burning to white.
  float boost = max(vEmph - 1.0, 0.0);
  float a = I * (prof + glow * 0.6 * boost) * min(vEmph, 1.0) * (1.0 + 0.25 * boost) * ends;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

const color = new Color();

function templateAttributes(): { position: BufferAttribute; index: BufferAttribute } {
  const verts = new Float32Array((SEGMENTS + 1) * 2 * 3);
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    verts.set([t, -1, 0, t, 1, 0], i * 6);
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { position: new BufferAttribute(verts, 3), index: new BufferAttribute(new Uint16Array(index), 1) };
}

export function Edges({ graph, fx }: { graph: SceneGraph; fx: SceneFx }) {
  const template = useMemo(templateAttributes, []);
  const geometry = useMemo(() => {
    const edges = graph.edges;
    const n = edges.length;
    const g = new InstancedBufferGeometry();
    g.setIndex(template.index);
    g.setAttribute("position", template.position);
    const p0 = new Float32Array(n * 3);
    const p1 = new Float32Array(n * 3);
    const p2 = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const perp = new Float32Array(n * 3);
    const rel = new Float32Array(n);
    const seed = new Float32Array(n);
    const index = new Float32Array(n);
    const len = new Float32Array(n);
    const ends = new Float32Array(n * 2);
    edges.forEach((edge, j) => {
      p0.set(edge.p0, j * 3);
      p1.set(edge.p1, j * 3);
      p2.set(edge.p2, j * 3);
      color.set(edge.color);
      col.set([color.r, color.g, color.b], j * 3);
      const dx = edge.p2[0] - edge.p0[0];
      const dz = edge.p2[2] - edge.p0[2];
      const dl = Math.hypot(dx, dz) || 1;
      perp.set([-dz / dl, 0, dx / dl], j * 3);
      rel[j] = edge.rel;
      seed[j] = edge.seed;
      index[j] = edge.i;
      len[j] = edge.len;
      ends.set([edge.from.i, edge.to.i], j * 2);
    });
    g.setAttribute("aP0", new InstancedBufferAttribute(p0, 3));
    g.setAttribute("aP1", new InstancedBufferAttribute(p1, 3));
    g.setAttribute("aP2", new InstancedBufferAttribute(p2, 3));
    g.setAttribute("aColor", new InstancedBufferAttribute(col, 3));
    g.setAttribute("aPerp", new InstancedBufferAttribute(perp, 3));
    g.setAttribute("aRel", new InstancedBufferAttribute(rel, 1));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
    g.setAttribute("aEdge", new InstancedBufferAttribute(index, 1));
    g.setAttribute("aLen", new InstancedBufferAttribute(len, 1));
    g.setAttribute("aEnds", new InstancedBufferAttribute(ends, 2));
    g.instanceCount = n;
    return g;
  }, [graph, template]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: fx.uniforms.uTime,
          uDpr: fx.uniforms.uDpr,
          uViewport: fx.uniforms.uViewport,
          uNodeTex: fx.uniforms.uNodeTex,
          uEdgeTex: fx.uniforms.uEdgeTex,
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [fx],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (!graph.edges.length) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={3} />;
}
