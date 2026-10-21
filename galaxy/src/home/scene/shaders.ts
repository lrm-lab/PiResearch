// GLSL for the home observatory (WebGL2 via three's ShaderMaterial).

/** Shared uniforms: one object referenced by every material. */
export const shared = {
  uTime: { value: 0 },
  /** Point sprite scale: drawing-buffer height / (2 tan(fov/2)). */
  uScale: { value: 1000 },
  /** 0 under prefers-reduced-motion: pulses and twinkles freeze. */
  uMotion: { value: 1 },
  uPixelRatio: { value: 1 },
};

const NOISE = /* glsl */ `
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0, 0, 0)), f - vec3(0, 0, 0)), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
                   mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
                   mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
`;

// ---------------------------------------------------------------------------
// Nebula shell: back-side sphere, indigo / teal fbm with a faint galactic band.

export const nebulaVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const nebulaFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 d = normalize(vDir);
    float drift = uTime * 0.006;
    float n = fbm(d * 2.1 + vec3(drift, 0.0, -drift * 0.5)) * 0.5 + 0.5;
    float m = fbm(d * 4.3 + vec3(0.0, drift, n * 1.4)) * 0.5 + 0.5;
    float w = fbm(d * 9.0 + n * 2.0) * 0.5 + 0.5;
    float band = exp(-pow((d.y + 0.22 * sin(d.x * 2.4 + 0.6)) * 2.4, 2.0));
    vec3 indigo = vec3(0.106, 0.122, 0.290);
    vec3 teal = vec3(0.051, 0.231, 0.247);
    vec3 rose = vec3(0.20, 0.08, 0.22);
    vec3 col = indigo * smoothstep(0.38, 0.92, n) * 0.85;
    col += teal * smoothstep(0.48, 0.95, m) * 0.75;
    col += rose * pow(smoothstep(0.55, 1.0, n * m * 1.6), 2.0) * 0.9;
    col *= 0.45 + 0.85 * band;
    col += vec3(0.035, 0.04, 0.075) * band * (0.6 + 0.4 * w);
    // Dark dust lanes cut through the band.
    col *= 1.0 - 0.55 * smoothstep(0.55, 0.8, w) * band;
    gl_FragColor = vec4(col * 0.42, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Background stars: fixed pixel size, slow twinkle.

export const starVertex = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 2.2) + aPhase * 60.0);
    vAlpha = mix(1.0, 0.45 + 0.55 * tw, uMotion);
    vColor = color;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

export const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float core = exp(-d * 10.0);
    float glow = exp(-d * 3.0) * 0.25;
    // Thin diffraction cross on the brightest stars.
    float cross = max(0.0, 1.0 - abs(uv.x) * 14.0) * max(0.0, 1.0 - abs(uv.y)) + max(0.0, 1.0 - abs(uv.y) * 14.0) * max(0.0, 1.0 - abs(uv.x));
    float a = (core + glow + cross * 0.12) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

// ---------------------------------------------------------------------------
// Galaxy points: dust, task bodies and the core, coloured by tone.

export const galaxyVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uMotion;
  uniform float uPulse;
  uniform float uImplode;
  uniform float uIgnite;
  attribute float aSize;
  attribute float aKind;
  attribute float aPhase;
  attribute float aState;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float r = length(p.xz);
    if (uImplode > 0.0) {
      float k = uImplode * uImplode;
      float a = k * (5.0 + 5.0 * aPhase) / (0.25 + r);
      float c = cos(a);
      float s = sin(a);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p *= 1.0 - smoothstep(0.0, 1.0, uImplode * (1.15 + 0.35 * aPhase));
    }
    if (uIgnite < 1.0) {
      // Launch: dust unfurls from the core, outer particles last.
      float grow = smoothstep(r * 0.55, r * 0.55 + 0.45, uIgnite);
      float a = (1.0 - grow) * 3.5;
      float c = cos(a);
      float s = sin(a);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p *= grow;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = aSize;
    float alpha = 1.0;
    float tw = 0.5 + 0.5 * sin(uTime * (1.1 + aPhase * 2.4) + aPhase * 50.0);
    vColor = color;
    if (aKind < 0.5) {
      alpha = 0.42 + 0.3 * mix(0.5, tw, uMotion);
      if (aState > 3.5) { alpha *= 0.4; vColor = vec3(dot(color, vec3(0.33))); }
    } else if (aKind < 1.5) {
      if (aState < 1.5 && aState > 0.5) {
        // open: dim protostar, slow 6 s breathing
        alpha = 0.5 + 0.18 * sin(uTime * 1.047 + aPhase * 6.28) * uMotion;
        size *= 0.9;
      } else if (aState < 2.5 && aState > 1.5) {
        // in_progress: 1.6 s pulse
        float pl = 0.5 + 0.5 * sin(uTime * 3.927 + aPhase * 6.28);
        alpha = 1.05 + 0.45 * pl * uMotion;
        size *= 1.0 + 0.3 * pl * uMotion;
      } else if (aState > 3.5) {
        // cancelled: cooled ember
        alpha = 0.45;
        vColor = vec3(dot(color, vec3(0.3, 0.4, 0.3))) * vec3(0.9, 0.85, 0.8);
      } else {
        alpha = 1.0 + 0.12 * (tw - 0.5) * uMotion;
      }
    } else {
      float pulse = 0.5 + 0.5 * sin(uTime * 2.6);
      size *= 1.0 + uPulse * 0.16 * pulse * uMotion;
      alpha = 1.0 + uPulse * 0.25 * pulse * uMotion;
    }
    if (uImplode > 0.0) alpha *= 1.0 + uImplode * 2.0 * (1.0 - uImplode);
    vAlpha = alpha;
    vKind = aKind;
    vDepth = -mv.z;
    gl_PointSize = max(1.0, size * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const galaxyFragment = /* glsl */ `
  uniform float uBright;
  uniform float uSat;
  uniform float uFade;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    vec3 col;
    float a;
    if (vKind > 1.5) {
      float r = sqrt(d);
      a = exp(-d * 22.0) * 2.2 + exp(-r * 4.2) * 0.55 * (1.0 - r);
      col = mix(vColor, vec3(1.0), exp(-d * 34.0));
    } else if (vKind > 0.5) {
      a = exp(-d * 10.0) * 1.35 + exp(-d * 2.6) * 0.32 * (1.0 - d);
      col = mix(vColor, vec3(1.0), exp(-d * 40.0) * 0.85);
    } else {
      a = exp(-d * 5.0) * 1.05;
      col = vColor;
    }
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    a *= vAlpha * uBright * uFade;
    gl_FragColor = vec4(col * a, a);
  }
`;

// ---------------------------------------------------------------------------
// Galaxy disc glow: a procedural spiral in the disc plane under the points.

export const discVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const discFragment = /* glsl */ `
  uniform float uTime;
  uniform float uTwist;
  uniform float uArms;
  uniform float uBright;
  uniform float uSat;
  uniform float uFade;
  uniform float uImplode;
  uniform float uIgnite;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float shrink = (1.0 - uImplode * 0.95) * max(0.001, uIgnite);
    p /= max(0.02, shrink);
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float spiral = 0.5 + 0.5 * cos(uArms * (a + uImplode * 6.0) - log(r + 0.04) * uTwist * uArms * 0.5);
    float fall = exp(-r * 3.4);
    float v = fall * (0.3 + 0.7 * pow(spiral, 2.5)) * smoothstep(1.0, 0.55, r);
    v += exp(-r * r * 60.0) * 0.6;
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.7, r));
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    float alpha = v * 0.62 * uBright * uFade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Orbiting light ring around a running study: a comet head chasing its tail.

export const ringVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uMotion;
  attribute float aAngle;
  attribute float aSize;
  varying float vGlow;
  void main() {
    float head = fract(aAngle / 6.28318 - uTime * 0.11 * uMotion);
    float tail = pow(head, 14.0);
    float second = pow(fract(head + 0.5), 30.0) * 0.5;
    vGlow = 0.1 + tail * 1.9 + second;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * (0.6 + tail * 1.4) * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying float vGlow;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float a = exp(-d * 6.0) * vGlow * uFade;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(vGlow - 1.0, 0.0, 1.0)) * a, a);
  }
`;

// ---------------------------------------------------------------------------
// Soft billboard glow (launch star, shock ring).

export const glowVertex = discVertex;

export const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uRing;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a;
    if (uRing > 0.0) {
      a = exp(-pow((r - 0.82) * 14.0, 2.0)) + exp(-r * 3.0) * 0.08;
    } else {
      a = exp(-r * r * 18.0) * 1.6 + exp(-r * 4.0) * 0.4;
    }
    a *= uIntensity * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), exp(-r * r * 40.0)) * a, a);
  }
`;

// ---------------------------------------------------------------------------
// Warp streaks: lines around the view axis, stretched by uWarp.

export const warpVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWarp;
  attribute float aSeed;
  attribute float aEnd;
  varying float vAlpha;
  void main() {
    float ang = aSeed * 6.28318 * 37.0;
    float rad = 0.7 + fract(aSeed * 91.7) * 5.5;
    float z = -(1.0 - fract(aSeed * 13.1 + uTime * (0.7 + fract(aSeed * 7.3) * 0.9))) * 40.0 - 1.0;
    float len = (0.5 + fract(aSeed * 3.7) * 2.0) * uWarp * 9.0;
    vec3 p = vec3(cos(ang) * rad, sin(ang) * rad, z - aEnd * len);
    vAlpha = uWarp * (0.35 + 0.65 * fract(aSeed * 5.1)) * (1.0 - aEnd * 0.85) * smoothstep(-41.0, -30.0, z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const warpFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * vAlpha * 1.6, vAlpha);
  }
`;
