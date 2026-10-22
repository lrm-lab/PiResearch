// Everything inside the Canvas. Reads the store, lifts the snapshot onto the desk, schedules the
// motion (intro, drops, flips) from snapshot diffs, and mounts the scene parts.

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { goalActivity } from "../lib/activity";
import { verificationIds } from "../lib/edges";
import { SURFACE } from "../lib/palette";
import { useTheme } from "../lib/theme";
import { useStudy } from "../study/store";
import { CameraRig } from "./CameraRig";
import { Cards } from "./Cards";
import { Desk, Lights } from "./Desk";
import { snapshotDiff, type NodeSignature } from "./diff";
import { Effects, QualityMonitor } from "./Effects";
import { hiddenIds } from "./emphasis";
import { useFontsReady } from "./fonts";
import { buildLayout } from "./layout";
import { LiveChips } from "./LiveChips";
import { Prism, PrismEnvironment, usePrismEnvScene } from "./Prism";
import { Relations } from "./Relations";
import { Ripples } from "./Ripples";
import { clock, PAST, SceneRuntime } from "./runtime";
import { Sheets } from "./Sheets";

/** Intro schedule (seconds after the intro starts). */
const FIRST_DROP = 0.45;
const DROP_STAGGER = 0.045;
const MAX_STAGGER_TOTAL = 1.5;

export function SceneRoot({
  rightInset,
  bottomInset,
  visible,
  labelLayer,
  onReady,
}: {
  rightInset: number;
  bottomInset: number;
  /** The map tab is showing (the chrome keeps the scene mounted but hidden otherwise). */
  visible: boolean;
  labelLayer: RefObject<HTMLElement>;
  onReady: () => void;
}) {
  const view = useStudy((s) => s.view);
  const studyId = useStudy((s) => s.studyId);
  const quality = useStudy((s) => s.effectiveQuality);
  const reduced = useStudy((s) => s.reducedMotion);
  const theme = useTheme();
  const rt = useMemo(() => new SceneRuntime(), []);
  const envScene = usePrismEnvScene();

  // One scale per snapshot, never shrinking within a study (nothing reshuffles as a run grows).
  const floor = useRef<{ study: string | null; scale: number }>({ study: null, scale: 0 });
  const layout = useMemo(() => {
    const keep = floor.current.study === studyId ? floor.current.scale : 0;
    return buildLayout(view, keep);
  }, [view, studyId]);
  useLayoutEffect(() => {
    floor.current = { study: studyId, scale: layout.nodes.size > 2 ? layout.scale : 0 };
  }, [layout, studyId]);

  // Glyphs every card face needs (titles, agent names).
  const sample = useMemo(() => {
    const chars = new Set<string>();
    for (const node of view?.nodes ?? []) for (const ch of `${node.title}${node.agents.join("")}`) chars.add(ch);
    return [...chars].sort().join("");
  }, [view]);
  const fonts = useFontsReady(sample);

  useLayoutEffect(() => {
    rt.verification = verificationIds(view?.edges ?? []);
    rt.activityTarget = goalActivity(view) ? 1 : 0;
  }, [rt, view]);

  // Motion schedule from snapshot diffs.
  const signature = useRef<{ study: string | null; sig: NodeSignature | null }>({ study: null, sig: null });
  useLayoutEffect(() => {
    if (signature.current.study !== studyId || !view) {
      if (signature.current.sig !== null || signature.current.study !== studyId) rt.reset();
      signature.current = { study: studyId, sig: null };
    }
    if (!view || fonts === 0) return;
    const prev = signature.current.sig;
    // The intro plays when the map is first shown, not while the scene waits hidden.
    if (prev === null && !visible) return;
    const t = clock();
    const diff = snapshotDiff(prev, view);
    if (prev === null) {
      rt.introAt = t + 0.05;
      rt.introSeq += 1;
      const stagger = Math.min(DROP_STAGGER, MAX_STAGGER_TOTAL / Math.max(1, diff.added.length));
      diff.added.forEach((id, i) => rt.dropAt.set(id, reduced ? PAST : rt.introAt + FIRST_DROP + i * stagger));
      const last = rt.introAt + FIRST_DROP + Math.max(0, diff.added.length - 1) * stagger;
      rt.prismAt = reduced ? PAST : last + 0.55;
    } else {
      diff.added.forEach((id, i) => rt.dropAt.set(id, reduced ? PAST : t + 0.1 + i * 0.09));
      for (const id of diff.statusChanged) rt.flipAt.set(id, t);
      for (const id of diff.removed) {
        rt.dropAt.delete(id);
        rt.motion.delete(id);
        rt.flipAt.delete(id);
      }
    }
    signature.current = { study: studyId, sig: diff.signature };
  }, [rt, view, studyId, fonts, reduced, visible]);

  // Per frame: the clock and the agent-filter set (cards, sheets and relations read them).
  const hiddenFor = useRef<{ agents: unknown; view: unknown }>({ agents: null, view: null });
  const readyFired = useRef(false);
  useFrame(() => {
    rt.time = clock();
    const { hiddenAgents } = useStudy.getState();
    const h = hiddenFor.current;
    if (h.agents !== hiddenAgents || h.view !== view) {
      rt.hidden = hiddenIds(view?.nodes ?? [], hiddenAgents);
      hiddenFor.current = { agents: hiddenAgents, view };
    }
    if (!readyFired.current && rt.introAt <= rt.time) {
      readyFired.current = true;
      onReady();
    }
  }, -4);

  const surface = SURFACE[theme];
  return (
    <>
      <color attach="background" args={[surface.ground]} />
      <fog attach="fog" args={[surface.ground, 40, 140]} />
      <Lights theme={theme} />
      <PrismEnvironment scene={envScene} />
      <Desk theme={theme} radius={layout.radius} />
      <Relations view={view} layout={layout} theme={theme} reduced={reduced} rt={rt} />
      <Cards view={view} layout={layout} theme={theme} fonts={fonts} reduced={reduced} rt={rt} />
      <Sheets view={view} layout={layout} theme={theme} reduced={reduced} rt={rt} />
      <Prism view={view} layout={layout} theme={theme} quality={quality} reduced={reduced} rt={rt} envScene={envScene} portal={labelLayer} />
      <Ripples rt={rt} />
      <LiveChips view={view} layout={layout} portal={labelLayer} rt={rt} reduced={reduced} />
      <CameraRig layout={layout} rt={rt} rightInset={rightInset} bottomInset={bottomInset} reduced={reduced} />
      <Effects theme={theme} quality={quality} />
      <QualityMonitor />
    </>
  );
}
