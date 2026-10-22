// Animated swirl gradient, ported from CoForge's copy of Spell's AnimatedGradient
// (apps/web/src/components/spell/animated-gradient.tsx in the CoForge repo; originally
// https://spell.sh/docs/animated-gradient, MIT). The fragment shader is unchanged; the presets are
// reduced to the one CoForge's landing page uses (`heroGradient` in
// features/landing/landing-brand-panel.tsx): the page ground, brand violet and lavender, slowed
// down so it reads as ambient light behind type. Dark in both themes, like the landing page.
//
// Local changes: no preset table or light palette, a `paused` prop that draws one frame (reduced
// motion, or the panel scrolled out of view), the device pixel ratio is capped at 2, and the
// canvas fades in once the first frame is drawn so the static fallback underneath never flashes.

import { useEffect, useRef, type CSSProperties } from "react";

export interface GradientConfig {
  color1: string;
  color2: string;
  color3: string;
  rotation: number;
  proportion: number;
  scale: number;
  speed: number;
  distortion: number;
  swirl: number;
  swirlIterations: number;
  softness: number;
  offset: number;
  shape: "Checks" | "Stripes" | "Edge";
  shapeSize: number;
}

/** CoForge landing hero ("Prism" shape and swirl, CoForge colours). */
export const PRISM_GRADIENT: GradientConfig = {
  color1: "#0a0912",
  color2: "#5d36dc",
  color3: "#c5bafe",
  rotation: -50,
  proportion: 42,
  scale: 0.4,
  speed: 8,
  distortion: 3,
  swirl: 55,
  swirlIterations: 12,
  softness: 100,
  offset: -299,
  shape: "Checks",
  shapeSize: 45,
};

const SHAPES = { Checks: 0, Stripes: 1, Edge: 2 } as const;

export function AnimatedGradient({
  config = PRISM_GRADIENT,
  paused = false,
  className,
  style,
}: {
  config?: GradientConfig;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Animation time survives pause/resume so the swirl continues where it stopped.
  const clockRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;

    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertex, VERTEX_SHADER);
    gl.compileShader(vertex);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragment, FRAGMENT_SHADER);
    gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const at = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      time: at("u_time"),
      resolution: at("u_resolution"),
      pixelRatio: at("u_pixelRatio"),
    };
    // Static uniforms: set once.
    const c1 = hexToRgba(config.color1);
    const c2 = hexToRgba(config.color2);
    const c3 = hexToRgba(config.color3);
    gl.uniform1f(at("u_scale"), config.scale);
    gl.uniform1f(at("u_rotation"), (config.rotation * Math.PI) / 180);
    gl.uniform4f(at("u_color1"), ...c1);
    gl.uniform4f(at("u_color2"), ...c2);
    gl.uniform4f(at("u_color3"), ...c3);
    gl.uniform1f(at("u_proportion"), config.proportion / 100);
    gl.uniform1f(at("u_softness"), config.softness / 100);
    gl.uniform1f(at("u_shape"), SHAPES[config.shape]);
    gl.uniform1f(at("u_shapeScale"), config.shapeSize / 100);
    gl.uniform1f(at("u_distortion"), config.distortion / 50);
    gl.uniform1f(at("u_swirl"), config.swirl / 100);
    gl.uniform1f(at("u_swirlIterations"), config.swirl === 0 ? 0 : config.swirlIterations);

    let ratio = 1;
    const resize = () => {
      ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(container.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(container.clientHeight * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (paused) draw();
    };

    const speed = (config.speed / 100) * 5;
    const draw = () => {
      gl.uniform1f(u.time, clockRef.current * speed + config.offset * 0.01);
      gl.uniform2f(u.resolution, canvas.width, canvas.height);
      gl.uniform1f(u.pixelRatio, ratio);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      canvas.style.opacity = "1";
    };

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      clockRef.current += Math.min(0.1, (now - last) / 1000);
      last = now;
      draw();
      frame = requestAnimationFrame(loop);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    if (paused) draw();
    else frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
    };
  }, [config, paused]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", opacity: 0, transition: "opacity 600ms ease-out" }}
      />
    </div>
  );
}

function hexToRgba(hex: string): [number, number, number, number] {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}`;

// Spell's shader, verbatim. Its only pow() takes abs() of its base, so it is safe on Metal/ANGLE.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;

uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

vec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur) {
  vec3 color1 = c1.rgb * c1.a;
  vec3 color2 = c2.rgb * c2.a;
  vec3 color3 = c3.rgb * c3.a;
  float r1 = smoothstep(.0 + .35 * edgesWidth, .7 - .35 * edgesWidth + .5 * edge_blur, mixer);
  float r2 = smoothstep(.3 + .35 * edgesWidth, 1. - .35 * edgesWidth + edge_blur, mixer);
  vec3 blended_color_2 = mix(color1, color2, r1);
  float blended_opacity_2 = mix(c1.a, c2.a, r1);
  vec3 c = mix(blended_color_2, color3, r2);
  float o = mix(blended_opacity_2, c3.a, r2);
  return vec4(c, o);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = .5 * u_time;
  float noise_scale = .0005 + .006 * u_scale;

  uv -= .5;
  uv *= (noise_scale * u_resolution);
  uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio;
  uv += .5;

  float n1 = noise(uv * 1. + t);
  float n2 = noise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));
  for (float i = 1.; i <= iterations_number; i++) {
    uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
    uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1. * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);

  float shape = 0.;
  float mixer = 0.;
  if (u_shape < .5) {
    vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    vec2 stripes_shape_uv = uv * (.25 + 3. * u_shapeScale);
    float f = fract(stripes_shape_uv.y);
    shape = smoothstep(.0, .55, f) * smoothstep(1., .45, f);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float sh = 1. - uv.y;
    sh -= .5;
    sh /= (noise_scale * u_resolution.y);
    sh += .5;
    float shape_scaling = .2 * (1. - u_shapeScale);
    shape = smoothstep(.45 - shape_scaling, .55 + shape_scaling, sh + .3 * (proportion - .5));
    mixer = shape;
  }

  vec4 color_mix = blend_colors(u_color1, u_color2, u_color3, mixer, 1. - clamp(u_softness, 0., 1.), .01 + .01 * u_scale);
  fragColor = vec4(color_mix.rgb, color_mix.a);
}
`;
