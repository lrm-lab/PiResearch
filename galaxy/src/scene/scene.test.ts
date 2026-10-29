import { describe, expect, it } from "vitest";
import { liftLayout } from "../lib/space";
import type { Edge, Snapshot, ViewNode } from "../types/api";
import { DIM, edgeTargets, nodeTargets } from "./emphasis";
import { buildGraph, KIND_GOAL, KIND_PROGRESS, REL_AUDIT, REL_PARENT } from "./graph";
import { cometOrbit, orbitOffset, orbitPosition, satelliteOrbits, tiltNormal } from "./orbits";

function node(id: string, extra: Partial<ViewNode> = {}): ViewNode {
  return {
    id,
    title: id,
    goal: false,
    x: 100 + id.length * 37,
    y: 200 + id.charCodeAt(id.length - 1) * 3,
    radius: 60,
    tone: "green",
    weight: "node",
    agents: [],
    status: "open",
    notes: "",
    children: [],
    steps: [],
    live: [],
    step_count: 0,
    ...extra,
  };
}

function snapshot(nodes: ViewNode[], edges: Edge[]): Snapshot {
  return { ok: true, message: "", goal: { id: "goal", title: "Q" }, nodes, edges, radius: 62, report: false };
}

const nodes = [
  node("goal", { goal: true, x: 500, y: 500, status: "" }),
  node("t1", { status: "resolved" }),
  node("t2", { status: "in_progress", x: 900, live: [{ tool: "bash", label: "【执行】x", error: false, count: 1 }] }),
  node("t3", { status: "open", x: 300, y: 900 }),
];
const edges: Edge[] = [
  { from: "goal", to: "t1", relation: "parent" },
  { from: "goal", to: "t2", relation: "parent" },
  { from: "goal", to: "t3", relation: "parent" },
  { from: "t1", to: "t2", relation: "fusion" },
  { from: "t3", to: "t1", relation: "error" },
  { from: "t1", to: "t3", relation: "error" },
];
const view = snapshot(nodes, edges);
const graph = buildGraph(view, liftLayout(nodes, edges, "Q"));

describe("orbits", () => {
  it("matches the GLSL orbitPos at theta 0", () => {
    const out = orbitOffset(2, 0.7, 1.1, 0, { x: 0, y: 0, z: 0 });
    expect(out.x).toBeCloseTo(2 * Math.cos(1.1));
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-2 * Math.sin(1.1));
  });

  it("keeps orbit points at the orbit radius and the tilt normal unit length", () => {
    const orbit = cometOrbit("t2", 0.4, 0, false);
    const p = orbitPosition(orbit, { x: 1, y: 2, z: 3 }, 7.3, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(p.x - 1, p.y - 2, p.z - 3)).toBeCloseTo(orbit.radius);
    const [nx, ny, nz] = tiltNormal({ incl: 0.5, node: 2 });
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
  });

  it("uses 2 satellite orbits up to 12 calls and 3 above", () => {
    expect(satelliteOrbits("t1", 0.4, 12)).toHaveLength(2);
    expect(satelliteOrbits("t1", 0.4, 13)).toHaveLength(3);
  });
});

describe("graph", () => {
  it("codes kinds, relations and error rims", () => {
    expect(graph.goal?.kind).toBe(KIND_GOAL);
    expect(graph.byId.get("t2")?.kind).toBe(KIND_PROGRESS);
    expect(graph.edges.find((edge) => edge.edge.relation === "fusion")?.rel).toBe(REL_AUDIT);
    expect(graph.edges[0]?.rel).toBe(REL_PARENT);
    // t1 is resolved, so its error edge does not light a rim; t3 is open, so it does.
    expect(graph.byId.get("t1")?.err).toBe(false);
    expect(graph.byId.get("t3")?.err).toBe(true);
    expect(graph.live).toBe(true);
  });

  it("is empty for a failed snapshot", () => {
    expect(buildGraph({ ...view, ok: false }, new Map()).nodes).toHaveLength(0);
  });
});

describe("emphasis", () => {
  it("brightens the selection and dims everything not linked to it", () => {
    const targets = nodeTargets(graph, { selectedId: "t2", hoveredId: null });
    expect(targets[graph.byId.get("t2")!.i]).toBeGreaterThan(1);
    expect(targets[graph.byId.get("t1")!.i]).toBe(1);
    expect(targets[graph.byId.get("t3")!.i]).toBeCloseTo(DIM);
    const lines = edgeTargets(graph, { selectedId: "t2", hoveredId: null });
    for (const edge of graph.edges) {
      const touches = edge.edge.from === "t2" || edge.edge.to === "t2";
      expect(lines[edge.i]! > 1).toBe(touches);
    }
  });

  it("hover brightens the node and its relations without dimming others", () => {
    const targets = nodeTargets(graph, { selectedId: null, hoveredId: "t3" });
    expect(targets[graph.byId.get("t3")!.i]).toBeGreaterThan(1);
    expect(targets[graph.byId.get("t1")!.i]).toBe(1);
  });
});
