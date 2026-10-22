// Factories for the scene's ShaderMaterials (uniform layouts live next to the GLSL in shaders.ts).

import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { deskFragment, deskVertex, edgeFragment, edgeVertex, glassFragment, glassVertex, rayFragment, relationFragment, ribbonVertex } from "./shaders";

function fogUniforms() {
  return UniformsUtils.clone(UniformsLib.fog);
}

export function deskMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: deskVertex,
    fragmentShader: deskFragment,
    fog: true,
    uniforms: {
      ...fogUniforms(),
      uGround: { value: new Color() },
      uTint: { value: new Color() },
      uDot: { value: new Color() },
      uTintRadius: { value: 20 },
      uSpacing: { value: 0.4 },
      uDotRadius: { value: 0.022 },
      uDotAlpha: { value: 1 },
    },
  });
}

export function edgeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: edgeVertex,
    fragmentShader: edgeFragment,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      ...fogUniforms(),
      uCore: { value: new Color() },
      uCoreA: { value: 0 },
      uGlow: { value: new Color() },
      uGlowA: { value: 0 },
      uBeam: { value: 0 },
      uBeamA: { value: new Color() },
      uBeamB: { value: new Color() },
      uPhase: { value: 0 },
      uOpacity: { value: 1 },
      uBoost: { value: 1 },
      uCoreW: { value: 0.02 },
    },
  });
}

export function relationMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: ribbonVertex,
    fragmentShader: relationFragment,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      ...fogUniforms(),
      uColor: { value: new Color() },
      uFlash: { value: new Color() },
      uMode: { value: 0 },
      uTime: { value: 0 },
      uLen: { value: 1 },
      uDraw: { value: 0 },
      uOpacity: { value: 1 },
      uHi: { value: 0 },
      uFlow: { value: 0 },
      uBoost: { value: 1 },
      uSeed: { value: 0 },
      uWidth: { value: 0.04 },
      uWidthEnd: { value: 0.04 },
    },
  });
}

export function rayMaterial(additive: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: ribbonVertex,
    fragmentShader: rayFragment,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
    uniforms: {
      ...fogUniforms(),
      uTone: { value: new Color() },
      uWhite: { value: new Color() },
      uTime: { value: 0 },
      uDraw: { value: 0 },
      uOpacity: { value: 1 },
      uPulse: { value: 0 },
      uBoost: { value: 1 },
      uAlpha: { value: 0.4 },
      uSeed: { value: 0 },
      uHi: { value: 0 },
      uWidth: { value: 0.08 },
      uWidthEnd: { value: 0.5 },
    },
  });
}

/** Reflection / dispersion / glint overlay drawn over the prism's refracting glass. */
export function glassMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: glassVertex,
    fragmentShader: glassFragment,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSweep: { value: 1 },
      uOpacity: { value: 1 },
      uDark: { value: 0 },
      uPulse: { value: 0 },
      uDeep: { value: new Color() },
      uMid: { value: new Color() },
      uLight: { value: new Color() },
    },
  });
}
