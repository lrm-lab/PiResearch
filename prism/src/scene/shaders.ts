// GLSL for the scene's custom materials. Colours arrive as linear uniforms (three's colour
// management) and leave through <colorspace_fragment>. Fog uses three's scene fog uniforms so
// everything melts into the page colour at the same distance.
//
// Safety: no pow() on values that can be negative (NaN on Metal/ANGLE turns the whole frame black
// through post-processing); every base is clamped or squared by multiplication.

const FOG_ALPHA = /* glsl */ `
  #ifdef USE_FOG
    float fogK = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.a *= 1.0 - fogK;
  #endif
`;

const FOG_COLOR = /* glsl */ `
  #ifdef USE_FOG
    float fogK = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogK);
  #endif
`;

// ---------------------------------------------------------------------------
// Desk: page colour, faint dot grid, soft central tint, fog to the page colour.

export const deskVertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const deskFragment = /* glsl */ `
  uniform vec3 uGround;
  uniform vec3 uTint;
  uniform vec3 uDot;
  uniform float uTintRadius;
  uniform float uSpacing;
  uniform float uDotRadius;
  uniform float uDotAlpha;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    float tint = 1.0 - smoothstep(0.0, uTintRadius, r);
    tint *= tint;
    vec3 col = mix(uGround, uTint, tint);

    vec2 g = (fract(p / uSpacing) - 0.5) * uSpacing;
    float d = length(g);
    float aa = max(fwidth(d), 1e-5);
    float dotMask = 1.0 - smoothstep(uDotRadius - aa, uDotRadius + aa, d);
    // Fade the grid where cells get too small on screen (no moiré toward the fog).
    float cellPx = uSpacing / max(length(fwidth(p)), 1e-5);
    float fade = smoothstep(6.0, 14.0, cellPx);
    col = mix(col, uDot, dotMask * uDotAlpha * fade);

    gl_FragColor = vec4(col, 1.0);
    ${FOG_COLOR}
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Card edge strip: selection outline, hover line, error glow, dark-theme luminous edge, border beam.

export const edgeVertex = /* glsl */ `
  attribute float aU;
  attribute float aDist;
  varying float vU;
  varying float vDist;
  #include <fog_pars_vertex>
  void main() {
    vU = aU;
    vDist = aDist;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const edgeFragment = /* glsl */ `
  uniform vec3 uCore;
  uniform float uCoreA;
  uniform vec3 uGlow;
  uniform float uGlowA;
  uniform float uBeam;
  uniform vec3 uBeamA;
  uniform vec3 uBeamB;
  uniform float uPhase;
  uniform float uOpacity;
  uniform float uBoost;
  uniform float uCoreW;
  varying float vU;
  varying float vDist;
  #include <fog_pars_fragment>
  void main() {
    float aa = max(fwidth(vDist), 1e-4);
    float core = smoothstep(-aa, aa, vDist) * (1.0 - smoothstep(uCoreW - aa, uCoreW + aa, vDist));
    float outside = max(vDist, 0.0);
    float glow = exp(-outside * 26.0) * smoothstep(-0.012, 0.0, vDist);

    // Beam: a bright head with a tail behind it, travelling along the perimeter.
    float d = fract(vU - uPhase);
    float tail = clamp((d - 0.76) / 0.24, 0.0, 1.0);
    float beam = uBeam * tail * tail;
    vec3 beamCol = mix(uBeamB, uBeamA, tail);

    float aCore = clamp(uCoreA * core, 0.0, 1.0);
    float aGlow = clamp(uGlowA * glow * 0.7, 0.0, 1.0);
    float aBeam = clamp(beam * (core * 1.2 + glow * 0.75), 0.0, 1.0);
    float sum = aCore + aGlow + aBeam;
    vec3 col = (uCore * aCore + uGlow * aGlow + beamCol * aBeam) / max(sum, 1e-4);
    float alpha = 1.0 - (1.0 - aCore) * (1.0 - aGlow) * (1.0 - aBeam);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uBoost, alpha * uOpacity);
    ${FOG_ALPHA}
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Ribbons (relations and spectrum rays): the vertex shader widens a centre line along aSide.

export const ribbonVertex = /* glsl */ `
  attribute vec3 aSide;
  uniform float uWidth;
  uniform float uWidthEnd;
  uniform float uHi;
  varying vec2 vUv;
  varying float vWidth;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    float w = mix(uWidth, uWidthEnd, uv.x) * (1.0 + 0.7 * uHi);
    vWidth = w;
    vec3 p = position + aSide * uv.y * w * 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** Modes: 0 parent, 1 audit / fusion, 2 support, 3 challenge, 4 error. */
export const relationFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFlash;
  uniform int uMode;
  uniform float uTime;
  uniform float uLen;
  uniform float uDraw;
  uniform float uOpacity;
  uniform float uHi;
  uniform float uFlow;
  uniform float uBoost;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vWidth;
  #include <fog_pars_fragment>
  void main() {
    float u = vUv.x;
    if (u > uDraw) discard;
    float across = abs(vUv.y);
    float aa = max(fwidth(vUv.y) * 1.5, 1e-4);
    float edge = 1.0 - smoothstep(1.0 - aa, 1.0, across);
    float s = u * uLen;
    float alpha = 0.0;
    vec3 col = uColor;
    float bright = 0.0;

    if (uMode == 0) {
      alpha = 0.78 * edge;
      if (uFlow > 0.5) {
        float dash = fract(s * 2.6 - uTime * 1.1);
        float on = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(0.48, 0.56, dash));
        alpha = edge * (0.4 + 0.45 * on);
      }
    } else if (uMode == 1) {
      float spacing = 0.12;
      float cell = (fract(s / spacing) - 0.5) * spacing;
      float hw = vWidth * 0.5;
      float dd = length(vec2(cell, vUv.y * hw));
      float r = hw * 0.85;
      float a2 = max(fwidth(dd), 1e-4);
      float dotMask = 1.0 - smoothstep(r - a2, r + a2, dd);
      float head = fract(uTime * 0.3 + uSeed) * 1.4 - 0.2;
      float behind = clamp(head - u, 0.0, 1.0);
      float scan = (u <= head) ? exp(-behind * uLen * 2.2) : exp(-(u - head) * uLen * 14.0);
      alpha = max(dotMask * 0.85, scan * edge * 0.75);
      bright = scan;
    } else if (uMode == 2) {
      float head = fract(uTime * 0.24 + uSeed);
      float g = exp(-abs(u - head) * uLen * 1.8);
      alpha = edge * (0.7 + 0.2 * g);
      bright = g;
    } else if (uMode == 3) {
      alpha = edge * 0.85;
    } else {
      float pulse = 0.5 + 0.5 * sin(uTime * 5.0 + uSeed * 6.28);
      alpha = edge * (0.45 + 0.5 * pulse);
      bright = pulse * 0.6;
    }

    // Draw-on: a brighter tip at the growing end.
    float tip = smoothstep(uDraw - 0.08, uDraw, u) * (1.0 - step(0.999, uDraw));
    alpha = max(alpha, tip * edge * 0.9);
    bright = max(bright, tip);

    alpha = mix(alpha, min(1.0, alpha * 1.5 + 0.1 * edge), uHi);
    col = mix(col, uFlash, clamp(bright, 0.0, 1.0) * 0.35);
    gl_FragColor = vec4(col * (1.0 + bright * (uBoost - 1.0)), alpha * uOpacity);
    if (gl_FragColor.a < 0.002) discard;
    ${FOG_ALPHA}
    #include <colorspace_fragment>
  }
`;

/** Spectrum ray: white at the prism turning into the agent's tone, soft across, fading at the end. */
export const rayFragment = /* glsl */ `
  uniform vec3 uTone;
  uniform vec3 uWhite;
  uniform float uTime;
  uniform float uDraw;
  uniform float uOpacity;
  uniform float uPulse;
  uniform float uBoost;
  uniform float uAlpha;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vWidth;
  #include <fog_pars_fragment>
  void main() {
    float u = vUv.x;
    if (u > uDraw) discard;
    float across = abs(vUv.y);
    float soft = 1.0 - across * across;
    soft *= soft;
    float t = smoothstep(0.0, 0.65, u);
    vec3 col = mix(uWhite, uTone, t);
    float fade = smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.9, 1.0, u));
    // A bright thin core inside the soft fan reads as a beam of light.
    float aa = max(fwidth(across) * 1.5, 1e-4);
    float core = 1.0 - smoothstep(0.12 - aa, 0.12 + aa, across);
    float alpha = (soft * 0.55 + core * 0.8) * fade * uAlpha * (0.62 + 0.38 * t);
    float head = fract(uTime * 0.42 + uSeed);
    float band = exp(-abs(u - head) * 9.0) * uPulse;
    alpha += band * soft * fade * 0.55;
    float shimmer = 0.92 + 0.08 * sin(u * 40.0 - uTime * 2.0 + uSeed * 6.0);
    gl_FragColor = vec4(col * (1.0 + (uBoost - 1.0) * (0.4 + band)), alpha * shimmer * uOpacity);
    if (gl_FragColor.a < 0.002) discard;
    ${FOG_ALPHA}
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Prism glass overlay: procedural studio reflections (deep room, sharp white strip lights), a
// Fresnel rim with spectral dispersion, and an occasional glint sweep. Drawn over the refracting
// transmission material, premultiplied.

export const glassVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vL;
  void main() {
    vL = position;
    vN = mat3(modelMatrix) * normal;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const glassFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSweep;
  uniform float uOpacity;
  uniform float uDark;
  uniform float uPulse;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uLight;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vL;

  vec3 spectrum(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }
  float strip(float a, float center, float width) {
    float d = abs(atan(sin(a - center), cos(a - center)));
    float k = 1.0 - smoothstep(0.0, width, d);
    return k * k * (3.0 - 2.0 * k);
  }

  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vW);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float f = 1.0 - ndv;
    float f2 = f * f;
    float fres = 0.3 + 0.7 * f2 * f;

    vec3 R = reflect(-V, N);
    float h = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    float az = atan(R.z, R.x);
    vec3 env = mix(uDeep, uMid, smoothstep(0.05, 0.65, h));
    env = mix(env, uLight, smoothstep(0.6, 1.0, h) * 0.75);
    float vert = smoothstep(0.0, 0.6, h) * (1.0 - smoothstep(0.7, 1.0, h));
    env = mix(env, mix(uMid, uLight, 0.5), 0.35 * (0.5 + 0.5 * sin(az * 1.3 + 0.6)));
    float s = (strip(az, 0.55, 0.7) * 0.7 + 0.5 * strip(az, -1.5, 0.9)) * vert;
    // On the white page the glass shows dark bands (white on white would vanish); on the dark desk, extra light.
    float sd = (strip(az, 2.35, 0.6) + 0.8 * strip(az, -2.8, 0.5) + 0.5 * strip(az, 1.3, 0.9)) * vert;
    env = mix(env, vec3(1.0), clamp(s, 0.0, 1.0));
    env = mix(env, uDeep, clamp(sd, 0.0, 1.0) * (1.0 - uDark) * 0.9);
    env = mix(env, vec3(1.0), clamp(sd, 0.0, 1.0) * uDark * 0.6);

    // Dispersion: a spectrum that slides across the glass with the view angle, strongest at grazing angles.
    float hue = fract(ndv * 1.4 + vL.y * 0.24 + vL.x * 0.16);
    vec3 rainbow = spectrum(hue);
    float rim = f2 * (0.3 + 0.7 * f);

    // Glint: a soft diagonal band crossing the faces now and then.
    float p = dot(vL.xy, vec2(0.45, 0.9)) + vL.z * 0.2;
    float phase = fract(uTime * 0.11) * 5.0 - 2.5;
    float q = (p - phase) * 2.6;
    float band = exp(-q * q) * uSweep;

    float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.4 + vL.y * 2.0));
    float refl = fres * (0.55 + 0.45 * dot(env, vec3(0.333)));
    float a = clamp(refl * (1.0 + 0.35 * (1.0 - uDark)) + rim * 0.5 + band * 0.55 + pulse * 0.18 + uDark * 0.06, 0.0, 1.0);
    vec3 rgb = env * fres * 0.9 + rainbow * rim * (0.55 + 0.25 * uDark) + vec3(band * 0.9) + uLight * pulse * 0.35;
    gl_FragColor = vec4(rgb * uOpacity, a * uOpacity);
    #include <colorspace_fragment>
  }
`;
