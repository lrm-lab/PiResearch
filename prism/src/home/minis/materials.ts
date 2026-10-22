// Shaders and shared geometry for the card mini-dioramas. Every pow() base is clamped to be
// non-negative (pow(x<0, y) is NaN on Metal/ANGLE). Colours arrive as THREE.Color uniforms (linear)
// and leave through three's colorspace chunk, so the desk matches the page colour exactly.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Dotted desk in the page colour: faint dots, a soft brand tint under the model, fading to
 *  transparent toward the edges so the square view never shows a seam against the card. */
export function createDeskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uGround: { value: new THREE.Color() },
      uTint: { value: new THREE.Color() },
      uDot: { value: new THREE.Color() },
      uRadius: { value: 3 },
      uTintStrength: { value: 0.8 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGround;
      uniform vec3 uTint;
      uniform vec3 uDot;
      uniform float uRadius;
      uniform float uTintStrength;
      varying vec2 vPos;
      void main() {
        float r = length(vPos);
        float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius, r);
        vec2 cell = fract(vPos / 0.22) - 0.5;
        float d = length(cell);
        float aa = fwidth(d) * 1.25;
        float dotMask = 1.0 - smoothstep(0.085 - aa, 0.085 + aa, d);
        float tint = 1.0 - smoothstep(0.0, uRadius * 0.85, r);
        vec3 color = mix(uGround, uTint, tint * uTintStrength);
        color = mix(color, uDot, dotMask * 0.95);
        gl_FragColor = vec4(color, fade);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Soft round contact shadow (alpha only). */
export function createShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x000000) }, uOpacity: { value: 0.18 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = clamp(length(p), 0.0, 1.0);
        float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** The glass prism: a translucent violet body with a fresnel rim and a faint spectrum that drifts
 *  across its faces; `uPulse` brightens it while a study is running. */
export function createPrismMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uBody: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uAlpha: { value: 0.42 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPulse;
      uniform vec3 uBody;
      uniform vec3 uRim;
      uniform float uAlpha;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float ndv = clamp(dot(n, normalize(vView)), 0.0, 1.0);
        float fresnel = pow(clamp(1.0 - ndv, 0.0, 1.0), 2.2);
        vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ndv * 1.2 + vWorld.y * 2.0 + uTime * 0.07));
        vec3 color = mix(uBody, spectrum, 0.22 + 0.3 * fresnel);
        color = mix(color, uRim, fresnel * 0.75);
        color += uRim * uPulse * 0.35;
        float alpha = clamp(uAlpha + fresnel * 0.45 + uPulse * 0.12, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A faint rainbow halo on the desk around the prism: white light split into colours. */
export function createHaloMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0.3 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float angle = atan(p.y, p.x);
        vec3 hue = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + angle / 6.28318 + uTime * 0.03));
        float ring = smoothstep(0.25, 0.55, r) * (1.0 - smoothstep(0.55, 1.0, r));
        float a = pow(clamp(ring, 0.0, 1.0), 1.3) * uStrength;
        gl_FragColor = vec4(hue, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

let slabGeometry: THREE.BufferGeometry | null = null;

/** Unit rounded box (scaled per instance into a thin card slab), shared by every mini. */
export function getSlabGeometry(): THREE.BufferGeometry {
  slabGeometry ??= new RoundedBoxGeometry(1, 1, 1, 3, 0.22);
  return slabGeometry;
}

let prismGeometry: { body: THREE.BufferGeometry; edges: THREE.BufferGeometry } | null = null;

/** Unit triangular prism standing on its base (flat-shaded), plus its edge lines. */
export function getPrismGeometry(): { body: THREE.BufferGeometry; edges: THREE.BufferGeometry } {
  if (!prismGeometry) {
    const indexed = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
    indexed.translate(0, 0.5, 0);
    const body = indexed.toNonIndexed();
    body.computeVertexNormals();
    const edges = new THREE.EdgesGeometry(indexed, 30);
    indexed.dispose();
    prismGeometry = { body, edges };
  }
  return prismGeometry;
}
