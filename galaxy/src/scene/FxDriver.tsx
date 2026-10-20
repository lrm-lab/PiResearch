// Keeps SceneFx in step with the store and advances it before anything renders.

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { goalActivity } from "../lib/activity";
import { useGalaxy } from "../store";
import { edgeTargets, nodeTargets } from "./emphasis";
import type { SceneFx } from "./fx";
import type { SceneGraph } from "./graph";

export function FxDriver({ fx, graph }: { fx: SceneFx; graph: SceneGraph }) {
  const view = useGalaxy((state) => state.view);
  const selectedId = useGalaxy((state) => state.selectedId);
  const hoveredId = useGalaxy((state) => state.hoveredId);
  const lens = useGalaxy((state) => state.lens);
  const reducedMotion = useGalaxy((state) => state.reducedMotion);

  useLayoutEffect(() => {
    fx.reduced = reducedMotion;
  }, [fx, reducedMotion]);

  useLayoutEffect(() => {
    fx.reduced = useGalaxy.getState().reducedMotion;
    fx.sync(graph);
    fx.liveTarget = graph.live ? 1 : 0;
  }, [fx, graph]);

  useLayoutEffect(() => {
    fx.activityTarget = goalActivity(view) ? 1 : 0;
  }, [fx, view]);

  useLayoutEffect(() => {
    const focus = { selectedId, hoveredId, lens };
    fx.setTargets(nodeTargets(graph, focus), edgeTargets(graph, focus), hoveredId);
  }, [fx, graph, selectedId, hoveredId, lens]);

  useFrame((state, delta) => {
    const dpr = state.viewport.dpr;
    fx.uniforms.uDpr.value = dpr;
    fx.uniforms.uViewport.value.set(state.size.width * dpr, state.size.height * dpr);
    fx.update(delta);
  }, -10);

  return null;
}
