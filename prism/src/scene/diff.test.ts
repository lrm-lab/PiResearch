import { describe, expect, it } from "vitest";
import { snapshotDiff, signatureOf } from "./diff";
import { fixtureSnapshot } from "./fixture.test-data";

describe("snapshotDiff", () => {
  it("treats every task of the first snapshot as added, in id order, goal excluded", () => {
    const diff = snapshotDiff(null, fixtureSnapshot());
    expect(diff.added).toHaveLength(30);
    expect(diff.added.slice(0, 3)).toEqual(["t1", "t2", "t3"]);
    expect(diff.added).toContain("t10");
    expect(diff.added.indexOf("t9")).toBeLessThan(diff.added.indexOf("t10"));
    expect(diff.added).not.toContain("goal");
    expect(diff.statusChanged).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("reports nothing for an identical snapshot", () => {
    const first = snapshotDiff(null, fixtureSnapshot());
    const again = snapshotDiff(first.signature, fixtureSnapshot({ revision: "r2" }));
    expect(again.added).toEqual([]);
    expect(again.statusChanged).toEqual([]);
  });

  it("finds new tasks, status changes and removed tasks", () => {
    const first = snapshotDiff(null, fixtureSnapshot());
    const next = fixtureSnapshot();
    next.nodes = next.nodes
      .filter((node) => node.id !== "t30")
      .map((node) => (node.id === "t8" ? { ...node, status: "in_progress" as const } : node));
    next.nodes.push({ ...next.nodes[1]!, id: "t31", x: 10, y: 10 });
    const diff = snapshotDiff(first.signature, next);
    expect(diff.added).toEqual(["t31"]);
    expect(diff.statusChanged).toEqual(["t8"]);
    expect(diff.removed).toEqual(["t30"]);
  });

  it("an incoming error edge changes the look (flip), a resolved task ignores it", () => {
    const base = fixtureSnapshot({ edges: [] });
    const first = snapshotDiff(null, base);
    const withError = fixtureSnapshot({
      edges: [
        { from: "t18", to: "t12", relation: "error" },
        { from: "t18", to: "t1", relation: "error" },
      ],
    });
    const diff = snapshotDiff(first.signature, withError);
    expect(diff.statusChanged).toEqual(["t12"]); // t1 is resolved: still "done"
    expect(signatureOf(withError).get("t12")).toBe("error");
  });

  it("handles a null snapshot", () => {
    expect(snapshotDiff(null, null).added).toEqual([]);
    expect(signatureOf(null).size).toBe(0);
  });
});
