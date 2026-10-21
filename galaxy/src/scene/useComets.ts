// Live calls as comets. Comets that end are kept for a short fade-out so
// they never pop; the particle shader and the chips both read this list.

import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneFx } from "./fx";
import type { SceneGraph } from "./graph";
import { cometOrbit, isThinking, type Orbit } from "./orbits";

export interface Comet {
  key: string;
  nodeId: string;
  /** Node row in the fx texture, or -1 once the node is gone. */
  nodeIndex: number;
  center: { x: number; y: number; z: number };
  tone: string;
  orbit: Orbit;
  thinking: boolean;
  label: string;
  bornAt: number;
  /** Scene time the fade-out starts; Infinity while live. */
  dieAt: number;
}

/** Fade-out of a finished comet (s). */
export const COMET_FADE = 0.9;

export function useComets(graph: SceneGraph, fx: SceneFx): Comet[] {
  const known = useRef(new Map<string, Comet>());
  const [retired, setRetired] = useState<Comet[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const current = useMemo(() => {
    const out: Comet[] = [];
    for (const node of graph.nodes) {
      if (node.node.goal) continue;
      node.node.live.forEach((call, j) => {
        const key = `${node.id}|${j}|${call.label}`;
        const thinking = isThinking(call);
        const previous = known.current.get(key);
        out.push({
          key,
          nodeId: node.id,
          nodeIndex: node.i,
          center: { x: node.p.x, y: node.p.y, z: node.p.z },
          tone: node.tone,
          orbit: cometOrbit(node.id, node.p.r, j, thinking),
          thinking,
          label: call.label,
          bornAt: previous ? previous.bornAt : fx.time,
          dieAt: Infinity,
        });
      });
    }
    return out;
  }, [graph, fx]);

  useEffect(() => {
    const keys = new Set(current.map((comet) => comet.key));
    const gone = [...known.current.values()].filter((comet) => !keys.has(comet.key));
    known.current = new Map(current.map((comet) => [comet.key, comet]));
    if (!gone.length || fx.reduced) return;
    const dying = gone.map((comet) => ({ ...comet, nodeIndex: -1, key: `${comet.key}#${fx.time}`, dieAt: fx.time }));
    setRetired((list) => [...list, ...dying]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const drop = new Set(dying.map((comet) => comet.key));
      setRetired((list) => list.filter((comet) => !drop.has(comet.key)));
    }, COMET_FADE * 1000 + 200);
    timers.current.add(timer);
  }, [current, fx]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return useMemo(() => (retired.length ? [...current, ...retired] : current), [current, retired]);
}
