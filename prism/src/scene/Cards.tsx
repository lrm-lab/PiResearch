// Tasks as 3D CoForge cards: a thin rounded slab, the face drawn on a canvas, an edge strip for the
// border beam / selection / glows, and a soft contact shadow. Each card eases toward targets read
// from the store every frame (hover, selection, lens, agent filter), so hovering never re-renders.

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, type Group, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from "three";
import { stateText, toolCount } from "../lib/activity";
import { errorTargets } from "../lib/edges";
import { agentTone, STATUS_HEX, SURFACE } from "../lib/palette";
import type { Theme } from "../lib/theme";
import { useStudy } from "../study/store";
import type { Snapshot, ViewNode } from "../types/api";
import { drawFace, faceKey, type FaceData } from "./cardFace";
import { BEAM_FROM, BEAM_TO, cardLook, SELECT_HEX } from "./colors";
import { GHOST_OPACITY, LENS_DIM } from "./emphasis";
import { CARD_D, CARD_W, deskPlane, edgeGeometry, faceGeometry, shadowTexture, slabGeometry } from "./geometry";
import { CARD_THICKNESS, stackHeight, type Layout, type LayoutNode } from "./layout";
import { edgeMaterial } from "./materials";
import { clock, type CardMotion, type SceneRuntime } from "./runtime";
import { damp, dropOffset, flipPose, hash01 } from "./tween";

/** Height a card drops from. */
const DROP_HEIGHT = 3.2;
/** In-progress cards float this high above their stack. */
const FLOAT = 0.3;
const HOVER_LIFT = 0.16;
const SELECT_LIFT = 0.08;
/** A press that moved further than this (px) is a drag, not a click. */
const CLICK_SLOP = 6;

interface CardProps {
  node: ViewNode;
  lay: LayoutNode;
  erroneous: boolean;
  state: string;
  calls: number;
  theme: Theme;
  fonts: number;
  reduced: boolean;
  rt: SceneRuntime;
}

const Card = memo(function Card({ node, lay, erroneous, state, calls, theme, fonts, reduced, rt }: CardProps) {
  const id = node.id;
  const gl = useThree((s) => s.gl);
  const outer = useRef<Group>(null);
  const lift = useRef<Group>(null);
  const shadow = useRef<Group>(null);

  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return t;
  }, [canvas, gl]);
  const faceMat = useMemo(() => new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }), [texture]);
  const slabMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.62, metalness: 0, transparent: true }), []);
  const edgeMat = useMemo(() => edgeMaterial(), []);
  const shadowMat = useMemo(
    () => new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false, color: new Color(SURFACE.light.ink) }),
    [],
  );
  useEffect(
    () => () => {
      texture.dispose();
      faceMat.dispose();
      slabMat.dispose();
      edgeMat.dispose();
      shadowMat.dispose();
    },
    [texture, faceMat, slabMat, edgeMat, shadowMat],
  );

  const look = cardLook(node.status, erroneous, theme);
  const face: FaceData = {
    id,
    title: node.title,
    state,
    tone: look.tone,
    agent: node.agents[0] ?? null,
    agentHex: agentTone(node.tone),
    calls,
    look,
  };
  const key = faceKey(face, theme, fonts);
  const faceRef = useRef(face);
  faceRef.current = face;
  const drawn = useRef<string | null>(null);
  const pending = useRef<FaceData | null>(null);

  // Paint the face; a status change waits for the flip to reach edge-on (see useFrame).
  useEffect(() => {
    const flipT = rt.flipAt.get(id);
    const flipping = !reduced && drawn.current !== null && flipT !== undefined && clock() - flipT < 0.3;
    if (flipping) pending.current = faceRef.current;
    else {
      drawFace(canvas, faceRef.current);
      texture.needsUpdate = true;
      pending.current = null;
    }
    drawn.current = key;
  }, [key, canvas, texture, rt, id, reduced]);

  useEffect(() => {
    slabMat.color.set(look.slab);
    const u = edgeMat.uniforms;
    u.uBeamA!.value.set(BEAM_FROM);
    u.uBeamB!.value.set(BEAM_TO);
    u.uBoost!.value = theme === "dark" ? 1.7 : 1;
  }, [slabMat, edgeMat, look.slab, theme]);

  const stack = stackHeight(node.step_count);
  const phase = useMemo(() => hash01(id), [id]);
  const anim = useRef({ base: Number.NaN, sel: 0, hov: 0 });

  useFrame((_, dt) => {
    const o = outer.current;
    const l = lift.current;
    const sh = shadow.current;
    if (!o || !l || !sh) return;
    const t = rt.time;
    let m: CardMotion | undefined = rt.motion.get(id);
    if (!m) {
      m = { y: 0, sink: 0, opacity: 1, shown: false, landedAt: Infinity };
      rt.motion.set(id, m);
    }
    const dropT = rt.dropAt.get(id);
    if (dropT === undefined || t < dropT) {
      o.visible = false;
      m.shown = false;
      return;
    }
    o.visible = true;
    m.shown = true;

    const st = useStudy.getState();
    const hovered = st.hoveredId === id;
    const selected = st.selectedId === id;
    const hidden = rt.hidden.has(id);
    const lensDim = st.lens && !rt.verification.has(id);
    const a = anim.current;
    const status = node.status;

    const sinkTarget = hidden ? 1 : 0;
    m.sink = reduced ? sinkTarget : damp(m.sink, sinkTarget, 6, dt);
    const restStack = stack * (1 - 0.75 * m.sink);
    const bob = status === "in_progress" && !reduced ? Math.sin(t * 1.7 + phase * 6.28) * 0.035 : 0;
    const float = status === "in_progress" ? (FLOAT + bob) * (1 - m.sink) : 0;
    const target = restStack + float + (hovered ? HOVER_LIFT : 0) + (selected ? SELECT_LIFT : 0) + (status === "cancelled" ? -0.01 : 0);
    a.base = reduced || Number.isNaN(a.base) ? target : damp(a.base, target, 9, dt);

    const drop = reduced ? { offset: 0, landed: true } : dropOffset(t - dropT, DROP_HEIGHT);
    if (drop.landed && m.landedAt === Infinity) {
      m.landedAt = t;
      if (!reduced && t - dropT < 2) rt.spawnRipple(lay.x, lay.z, look.ring, lay.w);
    }

    // Status flip.
    let flipAngle = 0;
    let flipLift = 0;
    const flipT = rt.flipAt.get(id);
    if (flipT !== undefined && !reduced && t - flipT < 0.72 && m.landedAt < t) {
      const pose = flipPose(t - flipT);
      flipAngle = pose.angle;
      flipLift = pose.lift;
      if (pose.swapped && pending.current) {
        drawFace(canvas, pending.current);
        texture.needsUpdate = true;
        pending.current = null;
        rt.spawnRipple(lay.x, lay.z, look.ring, lay.w * 0.8);
      }
    } else if (pending.current) {
      drawFace(canvas, pending.current);
      texture.needsUpdate = true;
      pending.current = null;
    }

    // Error shake: a small twist every few seconds.
    let shake = 0;
    if (look.tone === "error" && !reduced) {
      const local = (t + phase * 4.2) % 4.2;
      if (local < 0.5) shake = 0.07 * Math.sin(local * 48) * (1 - local / 0.5);
    }

    m.y = a.base + drop.offset + flipLift;
    const k = lay.k;
    l.position.y = m.y + (CARD_THICKNESS * k) / 2;
    l.rotation.set(flipAngle + (status === "cancelled" ? 0.05 : 0), shake, status === "cancelled" ? -0.07 : 0);

    const fadeIn = reduced ? 1 : Math.min(1, (t - dropT) / 0.12);
    const opacityTarget = hidden ? GHOST_OPACITY : lensDim ? LENS_DIM : 1;
    m.opacity = reduced ? opacityTarget : damp(m.opacity, opacityTarget, 7, dt);
    const opacity = m.opacity * fadeIn;
    faceMat.opacity = opacity;
    slabMat.opacity = opacity * look.slabOpacity;
    faceMat.depthWrite = opacity > 0.6;
    slabMat.depthWrite = opacity * look.slabOpacity > 0.6;

    // Edge strip.
    a.sel = reduced ? (selected ? 1 : 0) : damp(a.sel, selected ? 1 : 0, 12, dt);
    a.hov = reduced ? (hovered ? 1 : 0) : damp(a.hov, hovered && !selected ? 1 : 0, 12, dt);
    const u = edgeMat.uniforms;
    const dark = theme === "dark";
    const surface = SURFACE[theme];
    if (a.sel > 0.01) {
      u.uCore!.value.set(SELECT_HEX);
      u.uCoreA!.value = a.sel;
      u.uGlow!.value.set(SELECT_HEX);
      u.uGlowA!.value = 0.5 * a.sel;
      u.uCoreW!.value = 0.026;
    } else if (look.tone === "error") {
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.2 + phase * 6.28);
      u.uCore!.value.set(STATUS_HEX.error);
      u.uCoreA!.value = 0.85;
      u.uGlow!.value.set(STATUS_HEX.error);
      u.uGlowA!.value = 0.45 + 0.35 * pulse;
      u.uCoreW!.value = 0.018;
    } else if (a.hov > 0.01) {
      u.uCore!.value.set(surface.muted);
      u.uCoreA!.value = 0.55 * a.hov;
      u.uGlow!.value.set(dark ? surface.muted : surface.ink);
      u.uGlowA!.value = (dark ? 0.25 : 0.1) * a.hov;
      u.uCoreW!.value = 0.016;
    } else if (dark) {
      // Dark theme: luminous edges in the status colour.
      u.uCore!.value.set(look.ring);
      u.uCoreA!.value = look.dashed ? 0.2 : 0.4;
      u.uGlow!.value.set(look.ring);
      u.uGlowA!.value = look.dashed ? 0.06 : 0.16;
      u.uCoreW!.value = 0.014;
    } else {
      u.uCoreA!.value = 0;
      u.uGlowA!.value = 0;
    }
    u.uBeam!.value = status === "in_progress" && look.tone !== "error" ? 1 : 0;
    u.uPhase!.value = reduced ? 0.12 : t * 0.32 + phase;
    u.uOpacity!.value = opacity;

    // Contact shadow: tight at rest, larger, softer and offset as the card rises.
    const h = Math.max(0, m.y - restStack);
    const spread = 1 + 0.45 * h;
    sh.position.set(0.14 * h, 0.003, 0.2 * h);
    sh.scale.set(CARD_W * 1.22 * k * spread, 1, CARD_D * 1.36 * k * spread);
    shadowMat.opacity = (dark ? 0.6 : 0.34) * (1 / (1 + h * 2.4)) * opacity * (look.dashed ? 0.5 : 1);
  }, -2);

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    if (!rt.motion.get(id)?.shown) return;
    event.stopPropagation();
    useStudy.getState().hover(id);
    gl.domElement.style.cursor = "pointer";
  };
  const onOut = () => {
    useStudy.getState().unhover(id);
    gl.domElement.style.cursor = "";
  };
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (!rt.motion.get(id)?.shown) return;
    event.stopPropagation();
    if (event.delta > CLICK_SLOP) return;
    useStudy.getState().select(id);
  };
  useEffect(
    () => () => {
      useStudy.getState().unhover(id);
    },
    [id],
  );

  return (
    <group ref={outer} position={[lay.x, 0, lay.z]} visible={false}>
      <group ref={shadow}>
        <mesh geometry={deskPlane()} material={shadowMat} renderOrder={-5} />
      </group>
      <group ref={lift} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <group position-y={(-CARD_THICKNESS * lay.k) / 2} scale={lay.k}>
          <mesh geometry={slabGeometry()} material={slabMat} />
          <mesh geometry={faceGeometry()} material={faceMat} />
          <mesh geometry={edgeGeometry()} material={edgeMat} renderOrder={2} raycast={() => null} />
        </group>
      </group>
    </group>
  );
});

export function Cards({ view, layout, theme, fonts, reduced, rt }: { view: Snapshot | null; layout: Layout; theme: Theme; fonts: number; reduced: boolean; rt: SceneRuntime }) {
  const errors = useMemo(() => errorTargets(view?.edges ?? []), [view]);
  const tasks = useMemo(() => {
    const seen = new Set<string>();
    return (view?.nodes ?? []).filter((node) => {
      if (node.goal || seen.has(node.id) || !layout.nodes.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  }, [view, layout]);
  return (
    <>
      {tasks.map((node) => (
        <Card
          key={node.id}
          node={node}
          lay={layout.nodes.get(node.id)!}
          erroneous={errors.has(node.id)}
          state={stateText(view, node)}
          calls={toolCount(node)}
          theme={theme}
          fonts={fonts}
          reduced={reduced}
          rt={rt}
        />
      ))}
    </>
  );
}
