// The goal: a glass prism refracting a violet / lavender environment, slowly turning, with
// spectrum rays fanning across the desk to each agent's hub card (white at the prism, turning into
// the agent's tone). While the run plans or finalises, light pulses through the prism and the rays.
// The question floats above it as a CoForge card (DOM).

import { Environment, Html, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  EdgesGeometry,
  LineBasicMaterial,
  type BufferGeometry,
  type Group,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  NormalBlending,
  RingGeometry,
  Scene,
  ExtrudeGeometry,
  Shape,
  type Sprite,
  SpriteMaterial,
  type Texture,
} from "three";
import { goalActivity, phaseLabel, progress } from "../lib/activity";
import { agentTone, BRAND, LAVENDER, SURFACE } from "../lib/palette";
import type { QualityTier } from "../study/store";
import { useStudy } from "../study/store";
import type { Theme } from "../lib/theme";
import type { Snapshot, ViewNode } from "../types/api";
import { cx } from "../ui/cx";
import { GLASS_ATTENUATION, GLASS_TINT, mixHex, SELECT_HEX } from "./colors";
import { deskPlane, glowTexture, ribbonGeometry, shadowTexture, starTexture } from "./geometry";
import type { Layout } from "./layout";
import { glassMaterial, rayMaterial } from "./materials";
import { deskPath } from "./paths";
import type { SceneRuntime } from "./runtime";
import { damp, easeInOutCubic, easeOutBack, hash01 } from "./tween";

/** Circumradius of the prism's triangle and its height; it floats with its centre at PRISM_Y. */
export const PRISM_RADIUS = 0.98;
export const PRISM_HEIGHT = 2.2;
export const PRISM_Y = 1.45;
/** Top of the prism (camera framing, question card). */
export const PRISM_TOP = PRISM_Y + PRISM_HEIGHT / 2;

function prismGeometry(): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * PRISM_RADIUS;
    const y = Math.sin(a) * PRISM_RADIUS;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const bevel = 0.045;
  const g = new ExtrudeGeometry(shape, { depth: PRISM_HEIGHT - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -PRISM_HEIGHT / 2 + bevel, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * The environment the glass refracts: a deep violet studio with sharp white and lavender strip
 * lights. Hard contrast (bright strips against a dark room) is what makes flat glass facets read
 * as glass, on the white page as much as on the dark desk.
 */
export function PrismEnvironment({ scene }: { scene: Scene }) {
  return (
    <Environment scene={scene} resolution={512} frames={1}>
      <color attach="background" args={[BRAND[950]]} />
      <Lightformer form="rect" intensity={7} color={LAVENDER} position={[0, 6, -4]} scale={[12, 2.5, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={14} color="#ffffff" position={[-6, 1.5, 1]} scale={[1.2, 10, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={11} color={BRAND[300]} position={[6, 2, 2]} scale={[2.4, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={16} color="#ffffff" position={[2.5, 1.5, 6]} scale={[0.5, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={8} color={BRAND[400]} position={[-3.5, 1, -6]} scale={[1.6, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={12} color="#ffe9d6" position={[5, 0.5, -5]} scale={[0.6, 7, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={12} color="#d6f1ff" position={[-5.5, 0.5, 4]} scale={[0.6, 7, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={9} color={BRAND[50]} position={[0, 7, 3]} scale={2.5} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2} color={BRAND[600]} position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
    </Environment>
  );
}

function hubs(view: Snapshot | null, layout: Layout): ViewNode[] {
  const seen = new Set<string>();
  return (view?.nodes ?? []).filter((node) => {
    if (node.goal || node.weight !== "hub" || seen.has(node.id) || !layout.nodes.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function Ray({ hub, layout, theme, reduced, rt }: { hub: ViewNode; layout: Layout; theme: Theme; reduced: boolean; rt: SceneRuntime }) {
  const lay = layout.nodes.get(hub.id)!;
  const path = useMemo(
    () => deskPath({ x: 0, z: 0, w: 1, d: 1, round: PRISM_RADIUS * 0.7 }, { x: lay.x, z: lay.z, w: lay.w, d: lay.d }, { bend: 0, lane: 0, arch: 0, zigzag: 0 }, 40),
    [lay.x, lay.z, lay.w, lay.d],
  );
  const geometry = useMemo(() => ribbonGeometry(path), [path]);
  const dark = theme === "dark";
  const material = useMemo(() => rayMaterial(dark), [dark]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const u = material.uniforms;
    u.uTone!.value.set(agentTone(hub.tone));
    // The beam starts already tinted (a white start vanishes on the white page): the agent's tone
    // lifted a little toward white on the dark desk, the tone itself on the light page.
    u.uWhite!.value.set(dark ? mixHex(agentTone(hub.tone), SURFACE.light.card, 0.45) : agentTone(hub.tone));
    u.uAlpha!.value = dark ? 0.5 : 0.7;
    u.uBoost!.value = dark ? 1.5 : 1;
    u.uWidth!.value = 0.24;
    u.uWidthEnd!.value = Math.min(dark ? 1.0 : 0.8, lay.w * (dark ? 0.62 : 0.5));
    u.uSeed!.value = hash01(hub.id);
  }, [material, hub.tone, hub.id, dark, lay.w]);
  const opacity = useRef(1);

  useFrame((_, dt) => {
    const u = material.uniforms;
    const t = rt.time;
    u.uDraw!.value = reduced ? 1 : easeInOutCubic((t - rt.prismAt - 0.25) / 0.9);
    u.uTime!.value = reduced ? 0 : t;
    u.uPulse!.value = reduced ? 0 : rt.activity;
    const st = useStudy.getState();
    const target = st.lens ? 0.18 : rt.hidden.has(hub.id) ? 0.15 : st.hoveredId === hub.id || st.selectedId === hub.id ? 1.35 : 1;
    opacity.current = reduced ? target : damp(opacity.current, target, 6, dt);
    u.uOpacity!.value = opacity.current;
  }, -1);

  return <mesh geometry={geometry} material={material} position-y={0.002} renderOrder={0} frustumCulled={false} raycast={() => null} />;
}

function GoalCard({ view, goal, portal, rt, reduced }: { view: Snapshot | null; goal: ViewNode; portal: RefObject<HTMLElement>; rt: SceneRuntime; reduced: boolean }) {
  const selected = useStudy((s) => s.selectedId === goal.id);
  const hovered = useStudy((s) => s.hoveredId === goal.id);
  const wrap = useRef<HTMLDivElement>(null);
  const activity = goalActivity(view);
  const { resolved, total } = progress(view);
  const question = view?.goal?.title || goal.title;
  const shown = useRef(-1);

  useFrame(() => {
    const el = wrap.current;
    if (!el) return;
    const t = rt.time;
    const k = reduced ? (rt.prismAt <= t ? 1 : 0) : Math.min(1, Math.max(0, (t - rt.prismAt - 0.35) / 0.5));
    const lens = useStudy.getState().lens ? 0.55 : 1;
    const value = Math.round(k * lens * 100) / 100;
    if (value !== shown.current) {
      shown.current = value;
      el.style.opacity = String(value);
      el.style.transform = `translate(-50%, calc(-100% + ${(1 - k) * 10}px))`;
      el.style.visibility = value > 0 ? "visible" : "hidden";
    }
  }, -1);

  const st = useStudy.getState;
  return (
    <Html position={[0, PRISM_TOP + 0.3, 0]} portal={portal} zIndexRange={[20, 10]} pointerEvents="none">
      <div ref={wrap} style={{ opacity: 0, visibility: "hidden", transform: "translate(-50%, -100%)" }}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => st().select(goal.id)}
          onPointerEnter={() => st().hover(goal.id)}
          onPointerLeave={() => st().unhover(goal.id)}
          className={cx(
            "pointer-events-auto block w-max max-w-[min(15rem,62vw)] rounded-lg border border-secondary bg-primary/95 px-2.5 py-1.5 text-left shadow-md backdrop-blur-sm transition-[box-shadow,transform] duration-200 ease-out",
            (hovered || selected) && "-translate-y-0.5 shadow-lg",
            selected && "ring-2 ring-brand-600",
          )}
        >
          <span className="flex items-center gap-1.5 text-xs leading-4 text-tertiary">
            <span className={cx("size-1.5 shrink-0 rounded-full", view?.running ? "bg-status-progress" : "bg-status-done")} />
            <span className={cx(activity && "prism-shimmer")}>{phaseLabel(view)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular">
              {resolved}/{total}
            </span>
          </span>
          <span className={cx("mt-0.5 text-xs leading-4 font-semibold text-primary", hovered || selected ? "line-clamp-4" : "line-clamp-2")}>{question}</span>
        </button>
        {/* A hairline stem ties the card to the prism. */}
        <span aria-hidden="true" className="mx-auto block h-3 w-px bg-[var(--color-border-primary)]" />
      </div>
    </Html>
  );
}

export function Prism({
  view,
  layout,
  theme,
  quality,
  reduced,
  rt,
  envScene,
  portal,
}: {
  view: Snapshot | null;
  layout: Layout;
  theme: Theme;
  quality: QualityTier;
  reduced: boolean;
  rt: SceneRuntime;
  envScene: Scene;
  portal: RefObject<HTMLElement>;
}) {
  const gl = useThree((s) => s.gl);
  const goal = useMemo(() => view?.nodes.find((node) => node.goal) ?? null, [view]);
  const hubList = useMemo(() => hubs(view, layout), [view, layout]);
  const geometry = useMemo(() => prismGeometry(), []);
  const glassOverlay = useMemo(() => glassMaterial(), []);
  const edgeLines = useMemo(() => new EdgesGeometry(geometry, 25), [geometry]);
  const edgeLineMat = useMemo(() => new LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  const ringGeometry = useMemo(() => new RingGeometry(0.94, 1, 96).rotateX(-Math.PI / 2), []);
  const dark = theme === "dark";
  const causticMat = useMemo(() => new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  const shadowMat = useMemo(() => new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  const ringMat = useMemo(() => new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  const coreMat = useMemo(() => new SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  const glintMat = useMemo(() => new SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, toneMapped: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      edgeLines.dispose();
      glassOverlay.dispose();
      edgeLineMat.dispose();
      ringGeometry.dispose();
      for (const m of [causticMat, shadowMat, ringMat, coreMat, glintMat] as Material[]) m.dispose();
    },
    [geometry, edgeLines, glassOverlay, edgeLineMat, ringGeometry, causticMat, shadowMat, ringMat, coreMat, glintMat],
  );
  useEffect(() => {
    const u = glassOverlay.uniforms;
    u.uDeep!.value.set(dark ? BRAND[900] : BRAND[950]);
    u.uMid!.value.set(dark ? BRAND[500] : BRAND[700]);
    u.uLight!.value.set(dark ? BRAND[100] : BRAND[200]);
    u.uDark!.value = dark ? 1 : 0;
    edgeLineMat.color.set(dark ? BRAND[100] : BRAND[600]);
    edgeLineMat.opacity = dark ? 0.75 : 0.9;
    causticMat.color.set(dark ? BRAND[500] : LAVENDER);
    causticMat.blending = dark ? AdditiveBlending : NormalBlending;
    shadowMat.color.set(SURFACE.light.ink);
    coreMat.color.set(dark ? BRAND[300] : BRAND[400]);
    coreMat.blending = dark ? AdditiveBlending : NormalBlending;
    glintMat.color.set(dark ? BRAND[50] : SURFACE.light.card);
    glintMat.blending = dark ? AdditiveBlending : NormalBlending;
    for (const m of [causticMat, coreMat, glintMat]) m.needsUpdate = true;
  }, [dark, glassOverlay, edgeLineMat, causticMat, shadowMat, coreMat, glintMat]);

  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const glass = useRef<Mesh>(null);
  const caustic = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const core = useRef<Sprite>(null);
  const glint = useRef<Sprite>(null);
  const anim = useRef({ sel: 0, hov: 0, spin: 0 });

  useFrame((_, dt) => {
    const r = root.current;
    const s = spin.current;
    if (!r || !s) return;
    const t = rt.time;
    rt.activity = reduced ? rt.activityTarget : damp(rt.activity, rt.activityTarget, 2.5, dt);
    const appear = reduced ? (rt.prismAt <= t ? 1 : 0) : Math.max(0, Math.min(1, (t - rt.prismAt) / 0.85));
    r.visible = appear > 0;
    if (!r.visible) return;
    const a = anim.current;
    const st = useStudy.getState();
    const selected = goal !== null && st.selectedId === goal.id;
    const hovered = goal !== null && st.hoveredId === goal.id;
    a.sel = reduced ? (selected ? 1 : 0) : damp(a.sel, selected ? 1 : 0, 10, dt);
    a.hov = reduced ? (hovered ? 1 : 0) : damp(a.hov, hovered ? 1 : 0, 10, dt);

    const scale = reduced ? 1 : Math.max(0.001, easeOutBack(appear));
    s.scale.setScalar(scale);
    if (!reduced) a.spin += dt * (0.16 + rt.activity * 0.25);
    s.rotation.y = a.spin + 0.35;
    s.position.y = PRISM_Y + (reduced ? 0 : Math.sin(t * 0.9) * 0.05) + a.hov * 0.08 + (1 - appear) * 0.6;

    // Light pulse through the prism while planning / finalising.
    const pulse = reduced ? rt.activity * 0.6 : rt.activity * (0.5 + 0.5 * Math.sin(t * 3.4));
    if (core.current) {
      // Only while planning / finalising: at rest the glass should show what is behind it.
      coreMat.opacity = 0.55 * pulse * appear;
      core.current.visible = coreMat.opacity > 0.01;
      core.current.scale.setScalar(1.1 + pulse * 0.6);
    }
    if (caustic.current) {
      caustic.current.scale.set(4.2 + pulse * 0.8, 1, 3.4 + pulse * 0.8);
      causticMat.opacity = (dark ? 0.3 : 0.4) * appear * (0.75 + 0.25 * (reduced ? 1 : Math.sin(t * 0.8) * 0.5 + 0.5) + pulse * 0.4);
    }
    if (shadow.current) shadowMat.opacity = (dark ? 0.45 : 0.14) * appear;

    glassOverlay.uniforms.uTime!.value = t;
    glassOverlay.uniforms.uSweep!.value = reduced ? 0 : 1;
    glassOverlay.uniforms.uPulse!.value = reduced ? rt.activity * 0.6 : rt.activity;
    glassOverlay.uniforms.uOpacity!.value = appear;

    // Glint: one flash after the fade-in, then an occasional sparkle.
    if (glint.current) {
      const since = t - rt.prismAt - 0.75;
      const cycle = since > 1 ? (since - 1) % 7.5 : since;
      const g = reduced ? 0 : cycle >= 0 && cycle < 0.7 ? Math.sin((cycle / 0.7) * Math.PI) : 0;
      glintMat.opacity = g * (since > 1 ? 0.65 : 1);
      glintMat.rotation = t * 0.8;
      glint.current.scale.setScalar(0.25 + g * 0.75);
      glint.current.visible = g > 0.01;
    }

    if (ring.current) {
      const k = Math.max(a.sel, a.hov * 0.6);
      ring.current.visible = k > 0.01;
      ringMat.color.set(a.sel > 0.05 ? SELECT_HEX : SURFACE[theme].muted);
      ringMat.opacity = k;
      ring.current.scale.setScalar(PRISM_RADIUS * 2.1 + (1 - k) * 0.2);
    }

    // The transmission material needs the environment the <Environment> rendered into envScene.
    const mat = glass.current?.material as MeshPhysicalMaterial | undefined;
    const env = envScene.environment as Texture | null;
    if (mat && env && mat.envMap !== env) {
      mat.envMap = env;
      mat.needsUpdate = true;
    }
  }, -1);

  if (!goal || !layout.nodes.has(goal.id)) return null;

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    useStudy.getState().hover(goal.id);
    gl.domElement.style.cursor = "pointer";
  };
  const onOut = () => {
    useStudy.getState().unhover(goal.id);
    gl.domElement.style.cursor = "";
  };
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 6) return;
    useStudy.getState().select(goal.id);
  };

  const high = quality === "high";
  return (
    <>
      {hubList.map((hub) => (
        <Ray key={hub.id} hub={hub} layout={layout} theme={theme} reduced={reduced} rt={rt} />
      ))}
      <group ref={root} visible={false}>
        {/* The caustic falls in front of the prism (light from behind), so the glass refracts the
            dotted desk and the relations behind it rather than a flat glow. */}
        <mesh ref={caustic} geometry={deskPlane()} material={causticMat} position={[0.5, 0.003, 1.9]} renderOrder={-4} raycast={() => null} />
        <mesh ref={shadow} geometry={deskPlane()} material={shadowMat} position={[0.2, 0.0035, 0.3]} scale={[2.4, 1, 2.4]} renderOrder={-4} raycast={() => null} />
        <mesh ref={ring} geometry={ringGeometry} material={ringMat} position-y={0.006} renderOrder={2} raycast={() => null} />
        <group ref={spin} position-y={PRISM_Y}>
          <mesh ref={glass} geometry={geometry} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
            <MeshTransmissionMaterial
                samples={high ? 10 : 4}
                resolution={high ? 1024 : 512}
                transmission={1}
                thickness={0.9}
                roughness={0.02}
                ior={1.5}
                chromaticAberration={1.1}
                anisotropicBlur={0}
                distortion={0}
                distortionScale={0}
                temporalDistortion={0}
                color={GLASS_TINT}
                attenuationColor={dark ? GLASS_ATTENUATION : BRAND[300]}
                attenuationDistance={dark ? 2.6 : 6}
                specularIntensity={0.3}
                envMapIntensity={dark ? 0.8 : 0.5}
                backside={high}
                backsideThickness={0.9}
                backsideResolution={high ? 1024 : 256}
              />
          </mesh>
          <mesh geometry={geometry} material={glassOverlay} renderOrder={3} raycast={() => null} />
          <lineSegments geometry={edgeLines} material={edgeLineMat} raycast={() => null} />
          <sprite ref={core} material={coreMat} raycast={() => null} />
          <sprite ref={glint} material={glintMat} position={[0, PRISM_HEIGHT / 2 + 0.02, PRISM_RADIUS * 0.45]} raycast={() => null} />
        </group>
      </group>
      <GoalCard view={view} goal={goal} portal={portal} rt={rt} reduced={reduced} />
    </>
  );
}

export function usePrismEnvScene(): Scene {
  return useMemo(() => new Scene(), []);
}
