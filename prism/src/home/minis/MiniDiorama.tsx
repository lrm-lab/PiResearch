// One card's mini-diorama, rendered into the shared canvas through a drei View: the study's
// thumbnail as small rounded slabs on a dotted desk in the page colour, thin relation lines,
// spectrum rays from the goal, and a tiny glass prism at the goal. Slabs drop in on first sight,
// in-progress slabs float and bob, the model orbits slowly while its card is hovered.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, PerspectiveCamera } from "@react-three/drei";
import { agentTone, BRAND, LAVENDER, RELATION_HEX, STATUS_HEX, SURFACE } from "../../lib/palette";
import type { Theme } from "../../lib/theme";
import { useHome } from "../store";
import { frameDistance, LOOK_HEIGHT, miniLayout, type MiniLayout, type MiniSlab } from "./layout";
import {
  createDeskMaterial,
  createHaloMaterial,
  createPrismMaterial,
  createShadowMaterial,
  getPrismGeometry,
  getSlabGeometry,
} from "./materials";

const FOV = 30;
const REST_POLAR = 0.9;
const HOVER_POLAR = 0.78;
const REST_AZIMUTH = 0.22;
const FLOAT_HEIGHT = 0.16;
/** Seconds for one slab to drop; the stagger between slabs; the longest total intro. */
const DROP = 0.6;
const STAGGER = 0.05;
const MAX_INTRO = 1.1;

/** Mini-only scene colours per theme (the shared ones come from lib/palette.ts): the sky light,
 *  desk dots a step stronger than border-secondary so they survive the small size, and the neutral
 *  parent line dimmed for the dark desk. */
const MINI_PALETTE = {
  light: { sky: "#ffffff", dot: "#d9deea", parent: RELATION_HEX.parent },
  dark: { sky: "#c9c3e6", dot: "#2e2e33", parent: "#4b5260" },
} as const;

const tmpObject = new THREE.Object3D();
const tmpColor = new THREE.Color();
const white = new THREE.Color(MINI_PALETTE.light.sky);

/** Camera distance for a layout in a view of `aspect`, cached per layout and rounded aspect. */
const fitCache = new WeakMap<MiniLayout, Map<number, number>>();
function fitDistance(layout: MiniLayout, aspect: number): number {
  const key = Math.round(aspect * 50);
  let byAspect = fitCache.get(layout);
  if (!byAspect) {
    byAspect = new Map();
    fitCache.set(layout, byAspect);
  }
  let distance = byAspect.get(key);
  if (distance === undefined) {
    distance = frameDistance(layout.outline, key / 50, FOV, REST_POLAR, REST_AZIMUTH, 0.84);
    byAspect.set(key, distance);
  }
  return distance;
}

function easeOutBack(t: number): number {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function MiniDiorama({
  id,
  track,
  theme,
  reducedMotion,
}: {
  id: string;
  track: { current: HTMLElement };
  theme: Theme;
  reducedMotion: boolean;
}) {
  const thumb = useHome((state) => state.thumbs[id]);
  const running = useHome((state) => state.rows?.find((row) => row.id === id)?.status === "running");
  const layout = useMemo(() => miniLayout(thumb), [thumb]);
  const surface = SURFACE[theme];
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const rig = useRef<THREE.Group>(null);
  const motion = useRef({ spin: REST_AZIMUTH, polar: REST_POLAR, distance: 0, hot: 0 });
  const invalidate = useThree((state) => state.invalidate);

  // Static frames (reduced motion) still need a redraw when the hover changes.
  useEffect(() => {
    if (!reducedMotion) return;
    return useHome.subscribe((state, previous) => {
      if ((state.hovered === id) !== (previous.hovered === id)) invalidate();
    });
  }, [id, invalidate, reducedMotion]);

  useFrame((state, delta) => {
    const cam = camera.current;
    const group = rig.current;
    if (!cam || !group) return;
    const dt = Math.min(delta, 0.05);
    const m = motion.current;
    const hot = useHome.getState().hovered === id;
    const rect = track.current.getBoundingClientRect();
    const aspect = rect.height > 0 ? rect.width / rect.height : 1.6;
    const target = fitDistance(layout, aspect);
    if (reducedMotion) {
      m.spin = REST_AZIMUTH + (hot ? 0.45 : 0);
      m.polar = hot ? HOVER_POLAR : REST_POLAR;
      m.distance = target * (hot ? 0.94 : 1);
    } else {
      m.hot = damp(m.hot, hot ? 1 : 0, 6, dt);
      if (hot) {
        m.spin += dt * 0.5 * m.hot;
      } else {
        // Ease back to the nearest resting angle (never unwinding several turns).
        const turns = Math.round((m.spin - REST_AZIMUTH) / (Math.PI * 2));
        const sway = running ? Math.sin(state.clock.elapsedTime * 0.35) * 0.07 : 0;
        m.spin = damp(m.spin, REST_AZIMUTH + turns * Math.PI * 2 + sway, 2.4, dt);
      }
      m.polar = THREE.MathUtils.lerp(REST_POLAR, HOVER_POLAR, m.hot);
      m.distance = m.distance === 0 ? target : damp(m.distance, target * (1 - 0.06 * m.hot), 5, dt);
    }
    group.rotation.y = m.spin;
    const r = m.distance;
    cam.position.set(0, Math.cos(m.polar) * r, Math.sin(m.polar) * r);
    cam.lookAt(0, LOOK_HEIGHT, 0);
  });

  const sky = MINI_PALETTE[theme].sky;
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={0.1} far={80} position={[0, 5, 5]} />
      <hemisphereLight args={[sky, surface.ground, theme === "dark" ? 1.2 : 1.5]} />
      <directionalLight position={[-3, 7, 4]} intensity={theme === "dark" ? 1.5 : 1.7} />
      <directionalLight position={[4, 3, -2]} intensity={0.35} color={LAVENDER} />
      <group ref={rig}>
        <Desk layout={layout} theme={theme} />
        <Rays layout={layout} theme={theme} />
        <Slabs layout={layout} theme={theme} reducedMotion={reducedMotion} />
        <Prism layout={layout} theme={theme} running={running} reducedMotion={reducedMotion} />
      </group>
    </>
  );
}

function Desk({ layout, theme }: { layout: MiniLayout; theme: Theme }) {
  const material = useMemo(createDeskMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  const surface = SURFACE[theme];
  const radius = Math.max(layout.halfWidth, layout.halfDepth) * 1.45 + 1.1;
  useLayoutEffect(() => {
    material.uniforms.uGround!.value.set(surface.ground);
    material.uniforms.uTint!.value.set(surface.groundTint);
    material.uniforms.uDot!.value.set(MINI_PALETTE[theme].dot);
    material.uniforms.uTintStrength!.value = theme === "dark" ? 0.75 : 0.9;
    material.uniforms.uRadius!.value = radius;
  }, [material, surface, theme, radius]);
  return (
    <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={-2}>
      <planeGeometry args={[radius * 2.2, radius * 2.2]} />
    </mesh>
  );
}

/** Relation lines on the desk; edges from the goal are spectrum rays (lavender → agent tone). */
function Rays({ layout, theme }: { layout: MiniLayout; theme: Theme }) {
  const { points, colors } = useMemo(() => {
    const points: [number, number, number][] = [];
    const colors: [number, number, number][] = [];
    const parent = MINI_PALETTE[theme].parent;
    for (const line of layout.lines) {
      points.push([line.from[0], 0.006, line.from[1]], [line.to[0], 0.006, line.to[1]]);
      const start = line.fromGoal ? (theme === "dark" ? LAVENDER : BRAND[300]) : line.relation === "parent" ? parent : RELATION_HEX[line.relation];
      const end = line.fromGoal ? agentTone(line.tone) : line.relation === "parent" ? parent : RELATION_HEX[line.relation];
      const a = tmpColor.set(start);
      colors.push([a.r, a.g, a.b]);
      const b = tmpColor.set(end);
      colors.push([b.r, b.g, b.b]);
    }
    return { points, colors };
  }, [layout, theme]);
  if (!points.length) return null;
  return (
    <Line
      points={points}
      vertexColors={colors}
      segments
      lineWidth={1.15}
      transparent
      opacity={theme === "dark" ? 0.8 : 0.78}
      depthWrite={false}
      renderOrder={-1}
    />
  );
}

/** Status colour for a slab: CoForge task colours, a touch softer on the white desk. */
function slabColor(slab: MiniSlab, theme: Theme, out: THREE.Color): THREE.Color {
  out.set(STATUS_HEX[slab.tone]);
  if (theme === "light") out.lerp(white, slab.tone === "closed" ? 0.25 : 0.1);
  return out;
}

function Slabs({ layout, theme, reducedMotion }: { layout: MiniLayout; theme: Theme; reducedMotion: boolean }) {
  const solid = useRef<THREE.InstancedMesh>(null);
  const ghost = useRef<THREE.InstancedMesh>(null);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const geometry = getSlabGeometry();
  const shadowMaterial = useMemo(createShadowMaterial, []);
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial]);
  const births = useRef(new Map<string, number>());
  const clock = useThree((state) => state.clock);
  const invalidate = useThree((state) => state.invalidate);

  // Open tasks are translucent ghosts; everything else is solid.
  const groups = useMemo(() => {
    const solidSlabs: MiniSlab[] = [];
    const ghostSlabs: MiniSlab[] = [];
    for (const slab of layout.slabs) (slab.status === "open" ? ghostSlabs : solidSlabs).push(slab);
    return { solidSlabs, ghostSlabs };
  }, [layout]);
  const count = layout.slabs.length;

  // Birth times: new slabs drop in, staggered by task order; known slabs keep theirs.
  useLayoutEffect(() => {
    const now = clock.elapsedTime;
    const fresh = layout.slabs.filter((slab) => !births.current.has(slab.id));
    const stagger = fresh.length > 1 ? Math.min(STAGGER, MAX_INTRO / fresh.length) : 0;
    fresh.forEach((slab, index) => births.current.set(slab.id, reducedMotion ? -10 : now + 0.12 + index * stagger));
    invalidate();
  }, [layout, clock, reducedMotion, invalidate]);

  useLayoutEffect(() => {
    shadowMaterial.uniforms.uOpacity!.value = theme === "dark" ? 0.55 : 0.2;
    const paint = (mesh: THREE.InstancedMesh | null, slabs: MiniSlab[]) => {
      if (!mesh) return;
      slabs.forEach((slab, index) => mesh.setColorAt(index, slabColor(slab, theme, tmpColor)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    paint(solid.current, groups.solidSlabs);
    paint(ghost.current, groups.ghostSlabs);
    invalidate();
  }, [groups, theme, shadowMaterial, invalidate]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let animating = false;
    let shadowIndex = 0;
    const place = (mesh: THREE.InstancedMesh | null, slabs: MiniSlab[]) => {
      if (!mesh) return;
      slabs.forEach((slab, index) => {
        const born = births.current.get(slab.id) ?? -10;
        const p = THREE.MathUtils.clamp((t - born) / DROP, 0, 1);
        if (p < 1) animating = true;
        const drop = p <= 0 ? 0 : easeOutBack(p);
        let lift = 0;
        let tiltX = 0;
        let tiltZ = 0;
        let turn = 0;
        if (slab.tone === "progress") {
          lift = FLOAT_HEIGHT + (reducedMotion ? 0 : Math.sin(t * 2.1 + slab.order * 0.9) * 0.025);
          if (!reducedMotion) animating = true;
        } else if (slab.tone === "closed") {
          lift = -0.018;
          tiltX = 0.06;
          tiltZ = 0.1;
        } else if (slab.tone === "error" && !reducedMotion) {
          const phase = (t + slab.order * 0.7) % 3.4;
          if (phase < 0.45) turn = Math.sin(phase * 40) * 0.07 * (1 - phase / 0.45);
          animating = true;
        }
        const scale = p <= 0 ? 0.0001 : Math.min(1, 0.35 + drop * 0.65);
        tmpObject.position.set(slab.x, slab.h / 2 + lift + (1 - drop) * 0.9, slab.z);
        tmpObject.rotation.set(tiltX, turn, tiltZ);
        tmpObject.scale.set(slab.w * scale, slab.h * scale, slab.d * scale);
        tmpObject.updateMatrix();
        mesh.setMatrixAt(index, tmpObject.matrix);

        const shadow = shadows.current;
        if (shadow) {
          const height = Math.max(0, lift + (1 - drop) * 0.9);
          const spread = (1 + height * 2.2) * Math.max(0.0001, drop);
          tmpObject.position.set(slab.x + 0.02, 0.003, slab.z + 0.03);
          tmpObject.rotation.set(-Math.PI / 2, 0, 0);
          tmpObject.scale.set(slab.w * 1.45 * spread, slab.d * 1.6 * spread, 1);
          tmpObject.updateMatrix();
          shadow.setMatrixAt(shadowIndex, tmpObject.matrix);
          shadowIndex += 1;
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(solid.current, groups.solidSlabs);
    place(ghost.current, groups.ghostSlabs);
    if (shadows.current) shadows.current.instanceMatrix.needsUpdate = true;
    if (animating) state.invalidate();
  });

  if (!count) return null;
  return (
    <>
      <instancedMesh
        key={`shadow-${count}`}
        ref={shadows}
        args={[undefined, shadowMaterial, count]}
        renderOrder={0}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      {groups.solidSlabs.length > 0 && (
        <instancedMesh
          key={`solid-${groups.solidSlabs.length}`}
          ref={solid}
          args={[geometry, undefined, groups.solidSlabs.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.55} metalness={0} />
        </instancedMesh>
      )}
      {groups.ghostSlabs.length > 0 && (
        <instancedMesh
          key={`ghost-${groups.ghostSlabs.length}`}
          ref={ghost}
          args={[geometry, undefined, groups.ghostSlabs.length]}
          frustumCulled={false}
          renderOrder={1}
        >
          <meshStandardMaterial roughness={0.4} metalness={0} transparent opacity={theme === "dark" ? 0.5 : 0.42} depthWrite={false} />
        </instancedMesh>
      )}
    </>
  );
}

function Prism({
  layout,
  theme,
  running,
  reducedMotion,
}: {
  layout: MiniLayout;
  theme: Theme;
  running: boolean;
  reducedMotion: boolean;
}) {
  const { body, edges } = getPrismGeometry();
  const material = useMemo(createPrismMaterial, []);
  const halo = useMemo(createHaloMaterial, []);
  useEffect(
    () => () => {
      material.dispose();
      halo.dispose();
    },
    [material, halo],
  );
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const goal = layout.goal ?? { x: 0, z: 0, size: 0.34 };

  useLayoutEffect(() => {
    material.uniforms.uBody!.value.set(theme === "dark" ? BRAND[400] : BRAND[200]);
    material.uniforms.uRim!.value.set(theme === "dark" ? LAVENDER : BRAND[500]);
    material.uniforms.uAlpha!.value = theme === "dark" ? 0.4 : 0.5;
    halo.uniforms.uStrength!.value = theme === "dark" ? 0.3 : 0.2;
  }, [material, halo, theme]);

  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const t = state.clock.elapsedTime;
    born.current ??= t;
    const p = reducedMotion ? 1 : THREE.MathUtils.clamp((t - born.current - 0.25) / 0.7, 0, 1);
    const grow = p <= 0 ? 0.0001 : easeOutBack(p);
    node.scale.setScalar(grow);
    node.rotation.y = reducedMotion ? 0.5 : 0.5 + t * (running ? 0.45 : 0.18);
    const pulse = running && !reducedMotion ? 0.5 + 0.5 * Math.sin(t * 2.4) : running ? 0.4 : 0;
    material.uniforms.uTime!.value = reducedMotion ? 0 : t;
    material.uniforms.uPulse!.value = pulse;
    halo.uniforms.uTime!.value = reducedMotion ? 0 : t;
    if (p < 1) state.invalidate();
  });

  const size = goal.size;
  return (
    <group position={[goal.x, 0, goal.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} material={halo} renderOrder={-1}>
        <planeGeometry args={[size * 4.2, size * 4.2]} />
      </mesh>
      <group ref={group}>
        <group scale={[size, size * 1.35, size]}>
          <mesh geometry={body} material={material} renderOrder={2} />
          <lineSegments geometry={edges} renderOrder={3}>
            <lineBasicMaterial color={theme === "dark" ? LAVENDER : BRAND[500]} transparent opacity={theme === "dark" ? 0.85 : 0.7} />
          </lineSegments>
        </group>
      </group>
    </group>
  );
}
