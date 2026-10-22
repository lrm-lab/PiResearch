import { describe, expect, it } from "vitest";
import type { Edge } from "../types/api";
import { drawnRelation, edgeKey, errorTargets, linkedIds, verificationIds } from "./edges";

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
  it("draws fusion as audit", () => {
    expect(drawnRelation("fusion")).toBe("audit");
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
