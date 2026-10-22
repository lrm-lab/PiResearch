import { describe, expect, it } from "vitest";
import type { Edge } from "../types/api";
import { edgeEmphasis, GHOST_OPACITY, hiddenIds, isAgentHidden, LENS_DIM, nodeEmphasis, type FocusState } from "./emphasis";

const base: FocusState = { hoveredId: null, selectedId: null, lens: false, verification: new Set(["t5", "t1"]), hidden: new Set() };
const parent: Edge = { from: "goal", to: "t1", relation: "parent" };
const audit: Edge = { from: "t5", to: "t1", relation: "audit" };

describe("agent filter", () => {
  it("hides a task only when all of its agents are hidden; unassigned tasks never hide", () => {
    expect(isAgentHidden(["fiscal"], { fiscal: true })).toBe(true);
    expect(isAgentHidden(["fiscal", "debt"], { fiscal: true })).toBe(false);
    expect(isAgentHidden([], { fiscal: true })).toBe(false);
    expect(isAgentHidden(undefined, { fiscal: true })).toBe(false);
    const ids = hiddenIds([{ id: "a", agents: ["fiscal"] }, { id: "b", agents: [] }], { fiscal: true });
    expect([...ids]).toEqual(["a"]);
    expect(hiddenIds([{ id: "a", agents: ["fiscal"] }], {}).size).toBe(0);
  });
});

describe("nodeEmphasis", () => {
  it("ghosts hidden tasks, dims non-verification tasks under the lens", () => {
    expect(nodeEmphasis("t1", base)).toEqual({ opacity: 1, sink: false });
    expect(nodeEmphasis("t9", { ...base, hidden: new Set(["t9"]) })).toEqual({ opacity: GHOST_OPACITY, sink: true });
    expect(nodeEmphasis("t9", { ...base, lens: true }).opacity).toBe(LENS_DIM);
    expect(nodeEmphasis("t5", { ...base, lens: true }).opacity).toBe(1);
  });
});

describe("edgeEmphasis", () => {
  it("highlights relations of the hovered or selected task and steps back the rest", () => {
    expect(edgeEmphasis(parent, { ...base, hoveredId: "t1" })).toEqual({ opacity: 1, hi: 1 });
    expect(edgeEmphasis(parent, { ...base, selectedId: "goal" }).hi).toBe(1);
    expect(edgeEmphasis(parent, { ...base, hoveredId: "t7" }).opacity).toBeLessThan(1);
    expect(edgeEmphasis(parent, base)).toEqual({ opacity: 1, hi: 0 });
  });

  it("the lens keeps only verification relations", () => {
    expect(edgeEmphasis(parent, { ...base, lens: true }).opacity).toBeLessThan(0.1);
    expect(edgeEmphasis(audit, { ...base, lens: true }).opacity).toBe(1);
  });

  it("dims relations touching a hidden task", () => {
    expect(edgeEmphasis(audit, { ...base, hidden: new Set(["t5"]), hoveredId: "t1" }).opacity).toBeLessThan(0.2);
  });
});
