// Relations as flat light ribbons on the desk (DESIGN.md §3 relation table): parent neutral curve
// with dashes flowing toward an in-progress child, audit/fusion indigo dots with a scan, support
// green with a travelling glow, challenge an orange arch with a bead, error red, jagged, pulsing.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Mesh, MeshBasicMaterial, type ShaderMaterial, SphereGeometry } from "three";
import { drawnRelation, edgeKey } from "../lib/edges";
import { SURFACE } from "../lib/palette";
import type { Theme } from "../lib/theme";
import { useStudy } from "../study/store";
import type { Edge, Snapshot } from "../types/api";
import { mixHex, relationColor } from "./colors";
import { edgeEmphasis, type FocusState } from "./emphasis";
import { ribbonGeometry } from "./geometry";
import { PRISM_RADIUS } from "./Prism";
import type { Layout, LayoutNode } from "./layout";
import { relationMaterial } from "./materials";
import { deskPath, laneOffsets, pointAt, relationStyle, type DeskPath, type Footprint2D } from "./paths";
import type { SceneRuntime } from "./runtime";
import { damp, easeInOutCubic, hash01 } from "./tween";

const MODE: Record<ReturnType<typeof drawnRelation>, number> = { parent: 0, audit: 1, support: 2, challenge: 3, error: 4 };
const WIDTH: Record<ReturnType<typeof drawnRelation>, number> = { parent: 0.03, audit: 0.05, support: 0.04, challenge: 0.04, error: 0.036 };
/** Height above the desk per relation kind (verification above structure, no z-fighting). */
const LIFT: Record<ReturnType<typeof drawnRelation>, number> = { parent: 0.004, audit: 0.007, support: 0.006, challenge: 0.008, error: 0.009 };
const DRAW_TIME = 0.75;

export function footprintOf(lay: LayoutNode): Footprint2D {
  return lay.goal ? { x: lay.x, z: lay.z, w: lay.w, d: lay.d, round: PRISM_RADIUS + 0.08 } : { x: lay.x, z: lay.z, w: lay.w, d: lay.d };
}

interface Built {
  key: string;
  edge: Edge;
  kind: ReturnType<typeof drawnRelation>;
  path: DeskPath;
  seed: number;
}

function RelationRibbon({ built, theme, reduced, rt, goalId, firstSeen, childInProgress }: { built: Built; theme: Theme; reduced: boolean; rt: SceneRuntime; goalId: string | null; firstSeen: number; childInProgress: boolean }) {
  const geometry = useMemo(() => ribbonGeometry(built.path), [built.path]);
  const material = useMemo<ShaderMaterial>(() => relationMaterial(), []);
  const bead = useRef<Mesh>(null);
  const beadMat = useMemo(() => new MeshBasicMaterial({ transparent: true, toneMapped: false }), []);
  const beadGeo = useMemo(() => new SphereGeometry(0.04, 16, 12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      material.dispose();
      beadMat.dispose();
      beadGeo.dispose();
    },
    [material, beadMat, beadGeo],
  );

  useEffect(() => {
    const u = material.uniforms;
    // Structure stays neutral but must read on white: a deeper slate on the light desk.
    const base = relationColor(built.edge.relation);
    const color = built.kind === "parent" && theme === "light" ? mixHex(base, SURFACE.light.ink, 0.3) : base;
    u.uColor!.value.set(color);
    u.uFlash!.value.set(theme === "dark" ? SURFACE.dark.ink : color);
    u.uMode!.value = MODE[built.kind];
    u.uLen!.value = Math.max(0.01, built.path.length);
    u.uWidth!.value = WIDTH[built.kind];
    u.uWidthEnd!.value = WIDTH[built.kind];
    u.uBoost!.value = theme === "dark" ? 1.8 : 1.15;
    u.uSeed!.value = built.seed;
    beadMat.color.set(color);
    // Parent lines are a touch stronger on the dark desk.
    if (built.kind === "parent" && theme === "dark") u.uColor!.value.multiplyScalar(0.8);
  }, [material, beadMat, built, theme]);

  const state = useRef({ opacity: 1, hi: 0 });
  const focus = useRef<FocusState>({ hoveredId: null, selectedId: null, lens: false, verification: rt.verification, hidden: new Set() });

  useFrame((_, dt) => {
    const u = material.uniforms;
    const t = rt.time;
    const start = Math.max(firstSeen, rt.dropTime(built.edge.from, goalId), rt.dropTime(built.edge.to, goalId)) + 0.45;
    const draw = reduced ? 1 : easeInOutCubic((t - start) / DRAW_TIME);
    u.uDraw!.value = draw;
    u.uTime!.value = reduced ? 0.6 : t;
    u.uFlow!.value = childInProgress && !reduced ? 1 : 0;

    const st = useStudy.getState();
    const f = focus.current;
    f.hoveredId = st.hoveredId;
    f.selectedId = st.selectedId;
    f.lens = st.lens;
    f.verification = rt.verification;
    f.hidden = rt.hidden;
    const target = edgeEmphasis(built.edge, f);
    const s = state.current;
    s.opacity = reduced ? target.opacity : damp(s.opacity, target.opacity, 8, dt);
    s.hi = reduced ? target.hi : damp(s.hi, target.hi, 10, dt);
    u.uOpacity!.value = s.opacity * (draw > 0 ? 1 : 0);
    u.uHi!.value = s.hi;

    const b = bead.current;
    if (b) {
      b.visible = draw >= 1 && s.opacity > 0.05;
      const p = pointAt(built.path, reduced ? 0.5 : (t * 0.32 + built.seed) % 1);
      b.position.set(p.x, p.y + LIFT[built.kind] + 0.04, p.z);
      beadMat.opacity = s.opacity;
      b.scale.setScalar(1 + s.hi * 0.4);
    }
  }, -1);

  return (
    <group position-y={LIFT[built.kind]}>
      <mesh geometry={geometry} material={material} renderOrder={-3} frustumCulled={false} raycast={() => null} />
      {built.kind === "challenge" ? <mesh ref={bead} geometry={beadGeo} material={beadMat} renderOrder={-2} raycast={() => null} /> : null}
    </group>
  );
}

export function Relations({ view, layout, theme, reduced, rt }: { view: Snapshot | null; layout: Layout; theme: Theme; reduced: boolean; rt: SceneRuntime }) {
  const goalId = useMemo(() => view?.nodes.find((node) => node.goal)?.id ?? null, [view]);
  const firstSeen = useRef(new Map<string, number>());
  const built = useMemo(() => {
    const edges = (view?.edges ?? []).filter((edge) => layout.nodes.has(edge.from) && layout.nodes.has(edge.to) && edge.from !== edge.to);
    const lanes = laneOffsets(edges);
    return edges.map((edge, i): Built => {
      const kind = drawnRelation(edge.relation);
      const a = footprintOf(layout.nodes.get(edge.from)!);
      const b = footprintOf(layout.nodes.get(edge.to)!);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const path = deskPath(a, b, { ...relationStyle(edge.relation, len), lane: lanes[i]! });
      return { key: edgeKey(edge, i), edge, kind, path, seed: hash01(edgeKey(edge)) };
    });
  }, [view?.edges, layout]);

  // When each relation first appeared (new ones draw on; intro ones follow their cards).
  const seen = firstSeen.current;
  for (const b of built) if (!seen.has(b.key)) seen.set(b.key, rt.introAt === Infinity ? -Infinity : rt.time);

  const inProgress = useMemo(() => new Set((view?.nodes ?? []).filter((node) => node.status === "in_progress").map((node) => node.id)), [view]);

  return (
    <>
      {built.map((b) => (
        <RelationRibbon
          key={b.key}
          built={b}
          theme={theme}
          reduced={reduced}
          rt={rt}
          goalId={goalId}
          firstSeen={seen.get(b.key) ?? -Infinity}
          childInProgress={b.kind === "parent" && inProgress.has(b.edge.to)}
        />
      ))}
    </>
  );
}
