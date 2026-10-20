// Lifted 3D layout of the current view, recomputed only when geometry changes
// (status, notes or tool-call polls do not create a new Map).

import { useMemo } from "react";
import { liftLayout, type SpacePoint } from "../lib/space";
import { useGalaxy } from "../store";
import type { Snapshot } from "../types/api";

function geometryKey(view: Snapshot | null): string {
  if (!view || !view.ok) return "";
  return JSON.stringify([
    view.goal?.title ?? "",
    view.nodes.map((node) => [node.id, node.goal, node.x, node.y, node.radius, node.agents[0] ?? ""]),
    view.edges.filter((edge) => edge.relation === "parent").map((edge) => [edge.from, edge.to]),
  ]);
}

export function useLayout(): Map<string, SpacePoint> {
  const view = useGalaxy((state) => state.view);
  const key = geometryKey(view);
  // Keyed on geometry only, so polls that change status keep the same Map.
  return useMemo(() => (view && view.ok ? liftLayout(view.nodes, view.edges, view.goal?.title ?? "") : new Map()), [key]);
}
