// One study as a small floating galaxy. Geometry comes from its thumbnail
// (rebuilt only when the thumbnail signature changes); everything that moves
// is driven per frame from the shared gallery motion, without React renders.

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import { galaxyStudyHref } from "../../lib/api";
import { TONE_COLOR } from "../../lib/palette";
import { hash01 } from "../../lib/space";
import type { HistoryRow } from "../../types/api";
import { navigate } from "../flags";
import { buildGalaxy, hexToRgb } from "../geometry";
import { slotPose, slotX } from "../layout";
import { captionEls, captionSizes, gallery } from "../motion";
import { setThumbVisible } from "../polling";
import { useHome } from "../store";
import { fx } from "./fx";
import { discFragment, discVertex, galaxyFragment, galaxyVertex, ringFragment, ringVertex, shared } from "./shaders";

const RADIUS = 1.25;
const IMPLODE_S = 1.05;
/** Minimum gap (CSS px) between a caption and the viewport edge. */
const CAPTION_GUTTER = 8;
const RING_POINTS = 240;
const HIT = new CircleGeometry(RADIUS * 1.15, 32);
const HIT_MATERIAL = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
const RING_COLOR = new Color("#7fe6ff");

interface GalaxyProps {
  row: HistoryRow;
  rowIndex: 0 | 1;
  index: number;
  rowLen: number;
}

function ringGeometry(): BufferGeometry {
  const position = new Float32Array(RING_POINTS * 3);
  const angle = new Float32Array(RING_POINTS);
  const size = new Float32Array(RING_POINTS);
  for (let i = 0; i < RING_POINTS; i += 1) {
    const a = (i / RING_POINTS) * Math.PI * 2;
    const r = RADIUS * 1.18;
    position.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
    angle[i] = a;
    size[i] = 0.07;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aAngle", new BufferAttribute(angle, 1));
  geometry.setAttribute("aSize", new BufferAttribute(size, 1));
  return geometry;
}

const projected = new Vector3();
const goal = new Vector3();

export const Galaxy = memo(function Galaxy({ row, rowIndex, index, rowLen }: GalaxyProps) {
  const id = row.id;
  const thumb = useHome((state) => state.thumbs[id]);
  const removing = useHome((state) => Boolean(state.removing[id]));
  const outer = useRef<Group>(null!);
  const spin = useRef<Group>(null!);
  const live = useRef({ lift: 0, bright: 1, implode: 0, fade: 0, placed: false, visible: false, removeAt: 0 });
  const running = row.status === "running";
  const failed = row.status === "failed";

  const seed = useMemo(() => {
    const h = hash01(id);
    const k = hash01(`${id}#tilt`);
    return { tiltX: 0.92 + (h - 0.5) * 0.35, tiltZ: (k - 0.5) * 0.55, spin: h * Math.PI * 2, bob: k * Math.PI * 2 };
  }, [id]);

  const built = useMemo(() => {
    const data = buildGalaxy(thumb ?? null, id, { radius: RADIUS });
    const points = new BufferGeometry();
    points.setAttribute("position", new BufferAttribute(data.position, 3));
    points.setAttribute("color", new BufferAttribute(data.color, 3));
    points.setAttribute("aSize", new BufferAttribute(data.size, 1));
    points.setAttribute("aKind", new BufferAttribute(data.kind, 1));
    points.setAttribute("aPhase", new BufferAttribute(data.phase, 1));
    points.setAttribute("aState", new BufferAttribute(data.state, 1));
    points.computeBoundingSphere();
    const lines = new BufferGeometry();
    lines.setAttribute("position", new BufferAttribute(data.edgePosition, 3));
    lines.setAttribute("color", new BufferAttribute(data.edgeColor, 3));
    return { data, points, lines };
  }, [thumb, id]);

  // Created once per galaxy; data-dependent uniforms are updated in place below.
  const materials = useMemo(() => {
    const outerTone = hexToRgb(hash01(`${id}#hue`) < 0.5 ? TONE_COLOR.blue : TONE_COLOR.violet);
    const pointsMaterial = new ShaderMaterial({
      vertexShader: galaxyVertex,
      fragmentShader: galaxyFragment,
      uniforms: {
        uTime: shared.uTime,
        uScale: shared.uScale,
        uMotion: shared.uMotion,
        uPulse: { value: 0 },
        uImplode: { value: 0 },
        uIgnite: { value: 1 },
        uBright: { value: 1 },
        uSat: { value: 1 },
        uFade: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const discMaterial = new ShaderMaterial({
      vertexShader: discVertex,
      fragmentShader: discFragment,
      uniforms: {
        uTime: shared.uTime,
        uTwist: { value: 2.4 + hash01(`${id}#twist`) * 1.8 },
        uArms: { value: hash01(`${id}#arms`) < 0.3 ? 3 : 2 },
        uBright: { value: 1 },
        uSat: { value: 1 },
        uFade: { value: 0 },
        uImplode: { value: 0 },
        uIgnite: { value: 1 },
        uInner: { value: new Color() },
        uOuter: { value: new Color(...outerTone) },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const lineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
    const ringMaterial = new ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uTime: shared.uTime, uScale: shared.uScale, uMotion: shared.uMotion, uColor: { value: RING_COLOR }, uFade: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { pointsMaterial, discMaterial, lineMaterial, ringMaterial };
  }, [id]);

  // The disc's inner tone follows the thumbnail's core colour.
  useLayoutEffect(() => {
    const [cr, cg, cb] = built.data.core;
    (materials.discMaterial.uniforms.uInner!.value as Color).setRGB(
      Math.min(1, cr * 0.6 + 0.4),
      Math.min(1, cg * 0.6 + 0.4),
      Math.min(1, cb * 0.6 + 0.4),
    );
  }, [built, materials]);

  const ring = useMemo(() => (running ? ringGeometry() : null), [running]);
  const disc = useMemo(() => new PlaneGeometry(RADIUS * 2.5, RADIUS * 2.5), []);

  useEffect(
    () => () => {
      built.points.dispose();
      built.lines.dispose();
    },
    [built],
  );
  useEffect(
    () => () => {
      materials.pointsMaterial.dispose();
      materials.discMaterial.dispose();
      materials.lineMaterial.dispose();
      materials.ringMaterial.dispose();
    },
    [materials],
  );
  useEffect(() => () => ring?.dispose(), [ring]);
  useEffect(() => () => disc.dispose(), [disc]);

  useEffect(() => {
    fx.galaxies.set(id, outer.current);
    return () => {
      if (fx.galaxies.get(id) === outer.current) fx.galaxies.delete(id);
      setThumbVisible(id, false);
    };
  }, [id]);

  useEffect(() => {
    if (removing) live.current.removeAt = shared.uTime.value;
  }, [removing]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const store = useHome.getState();
    const params = gallery.params;
    const motion = store.reducedMotion ? 0 : 1;
    const shift = rowIndex === 0 && gallery.launchSlot ? 1 : 0;
    const x = slotX(index + shift, rowLen + shift, params.spacing, gallery.bounds.fits) - gallery.scroll;
    const pose = slotPose(x, rowIndex, params);
    const active = !store.launch && (store.hovered === id || store.focused === id);
    const l = live.current;
    l.lift = MathUtils.damp(l.lift, active ? 1 : 0, 7, dt);
    const bob = Math.sin(state.clock.elapsedTime * 0.45 + seed.bob) * 0.09 * motion;
    const target = goal.set(pose.x, pose.y + bob + l.lift * (rowIndex === 1 ? 0.75 : 0.22), pose.z + l.lift * 1.6);
    const group = outer.current;
    if (!l.placed) {
      group.position.copy(target);
      l.placed = true;
    } else {
      const k = store.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      group.position.lerp(target, k);
    }
    group.rotation.y = MathUtils.damp(group.rotation.y, pose.rotY * (1 - l.lift * 0.7), 6, dt);
    const scale = 1 + l.lift * 0.14;
    group.scale.setScalar(scale);
    spin.current.rotation.y += dt * motion * (running ? 0.16 : failed ? 0 : 0.035) * (1 + l.lift * 0.8);

    // Delete: swirl into the core, flash, vanish.
    if (removing) {
      l.implode = Math.min(1, (shared.uTime.value - l.removeAt) / IMPLODE_S);
      if (l.implode >= 1) store.finishRemove(id);
    }
    l.fade = Math.min(1, l.fade + dt * 1.2);
    const baseBright = failed ? 0.5 : running ? 1.08 : 0.92;
    l.bright = MathUtils.damp(l.bright, baseBright * (1 + l.lift * 0.55), 6, dt);
    const u = materials.pointsMaterial.uniforms;
    u.uBright!.value = l.bright;
    u.uSat!.value = failed ? 0.18 : 1;
    u.uPulse!.value = running ? 1 : 0;
    u.uImplode!.value = l.implode;
    u.uFade!.value = l.fade;
    const d = materials.discMaterial.uniforms;
    d.uBright!.value = l.bright * (running ? 1.1 : 0.85);
    d.uSat!.value = failed ? 0.12 : 1;
    d.uImplode!.value = l.implode;
    d.uFade!.value = l.fade;
    materials.lineMaterial.opacity = l.fade * (0.55 + l.lift * 0.45) * (1 - l.implode) * (failed ? 0.45 : 1);
    materials.ringMaterial.uniforms.uFade!.value = l.fade * (1 - l.implode) * (0.75 + l.lift * 0.5);

    // Caption under the galaxy (DOM, positioned here every frame).
    projected.set(group.position.x, group.position.y - RADIUS * scale * 0.98, group.position.z).project(state.camera);
    const el = captionEls.get(id);
    const edge = Math.abs(projected.x);
    if (el) {
      let px = (projected.x * 0.5 + 0.5) * gallery.width;
      let py = (-projected.y * 0.5 + 0.5) * gallery.height;
      const depthScale = MathUtils.clamp(params.camDist / Math.max(1, params.camDist - group.position.z), 0.7, 1.25);
      // Keep the (scaled) caption inside the viewport and above the composer;
      // the expanded caption of a hovered/focused galaxy grows downward.
      const size = captionSizes.get(id);
      if (size) {
        const half = (size.width * depthScale) / 2;
        if (gallery.width > half * 2 + CAPTION_GUTTER * 2) px = MathUtils.clamp(px, half + CAPTION_GUTTER, gallery.width - half - CAPTION_GUTTER);
        if (gallery.composerReserve > 0) py = Math.min(py, gallery.height - gallery.composerReserve - size.height * depthScale);
      }
      const opacity = (1 - MathUtils.smoothstep(edge, 0.8, 0.98)) * (1 - l.implode) * l.fade * (store.flight || store.launch ? 0 : 1);
      el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translateX(-50%) scale(${depthScale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.dataset.hidden = opacity < 0.05 ? "true" : "false";
    }
    const visible = edge < 1.25;
    if (visible !== l.visible) {
      l.visible = visible;
      setThumbVisible(id, visible);
    }
  });

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (!gallery.dragging) useHome.getState().hover(id);
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    useHome.getState().unhover(id);
    document.body.style.cursor = "";
  };
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 6 || gallery.dragged) return;
    const store = useHome.getState();
    if (store.removing[id]) return;
    const href = galaxyStudyHref(id);
    // Same as the caption link: reduced motion skips the dive and just navigates.
    if (store.reducedMotion) navigate(href);
    else store.fly({ id, href });
  };

  return (
    <group ref={outer}>
      <group rotation={[seed.tiltX, 0, seed.tiltZ]}>
        <group ref={spin} rotation={[0, seed.spin, 0]}>
          <mesh geometry={disc} material={materials.discMaterial} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
          <lineSegments geometry={built.lines} material={materials.lineMaterial} renderOrder={2} />
          <points geometry={built.points} material={materials.pointsMaterial} renderOrder={3} />
          {ring && <points geometry={ring} material={materials.ringMaterial} renderOrder={4} />}
        </group>
      </group>
      <mesh geometry={HIT} material={HIT_MATERIAL} dispose={null} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
    </group>
  );
});
