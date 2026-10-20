import { describe, expect, it } from "vitest";
import type { Edge } from "../types/api";
import { drawnRelation, edgeKey, edgesByRelation, errorTargets, groupByRelation, linkedIds, verificationIds } from "./edges";
import { sortNodes } from "./order";

const edges: Edge[] = [
  { from: "goal", to: "t1", relation: "parent" },
  { from: "t1", to: "t2", relation: "parent" },
  { from: "goal", to: "t3", relation: "parent" },
  { from: "t4", to: "t1", relation: "audit" },
  { from: "t4", to: "t1", relation: "support" },
  { from: "t5", to: "t2", relation: "challenge" },
  { from: "t5", to: "t2", relation: "error" },
  { from: "t6", to: "t3", relation: "fusion" },
];

describe("edges", () => {
  it("filters by one or several relations", () => {
    expect(edgesByRelation(edges, "parent")).toHaveLength(3);
    expect(edgesByRelation(edges, ["audit", "support"])).toHaveLength(2);
  });

  it("groups fusion with audit", () => {
    expect(drawnRelation("fusion")).toBe("audit");
    const groups = groupByRelation(edges);
    expect(groups.audit.map((edge) => edge.from)).toEqual(["t4", "t6"]);
    expect(groups.parent).toHaveLength(3);
    expect(groups.error).toHaveLength(1);
  });

  it("finds error targets", () => {
    expect([...errorTargets(edges)]).toEqual(["t2"]);
  });

  it("links a node to its neighbours over any relation", () => {
    expect([...linkedIds(edges, "t1")].sort()).toEqual(["goal", "t1", "t2", "t4"]);
    expect([...linkedIds(edges, "zzz")]).toEqual(["zzz"]);
  });

  it("collects verification endpoints", () => {
    expect([...verificationIds(edges)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
  });

  it("builds stable keys", () => {
    expect(edgeKey(edges[0]!)).toBe("goal>t1:parent");
    expect(edgeKey(edges[0]!, 3)).toBe("goal>t1:parent#3");
  });
});

describe("sortNodes", () => {
  it("puts the goal first and orders tasks numerically", () => {
    const ids = sortNodes([{ id: "t10" }, { id: "t2" }, { id: "goal", goal: true }, { id: "t1" }, { id: "x" }]).map((n) => n.id);
    expect(ids).toEqual(["goal", "t1", "t2", "t10", "x"]);
  });
});
