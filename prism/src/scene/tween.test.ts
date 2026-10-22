import { describe, expect, it } from "vitest";
import { damp, dropOffset, easeInOutCubic, easeOutBack, flipPose, hash01 } from "./tween";

describe("tween", () => {
  it("eases stay within bounds at the ends", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(2)).toBe(1);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...[0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
  });

  it("damps toward the target, frame-rate independently", () => {
    const one = damp(0, 1, 5, 0.032);
    const two = damp(damp(0, 1, 5, 0.016), 1, 5, 0.016);
    expect(one).toBeCloseTo(two, 6);
    expect(damp(Number.NaN, 3, 5, 0.016)).toBe(3);
  });

  it("drops from the height, lands, and settles", () => {
    expect(dropOffset(0, 3).offset).toBe(3);
    expect(dropOffset(0.2, 3).landed).toBe(false);
    const landed = dropOffset(0.43, 3);
    expect(landed.landed).toBe(true);
    expect(landed.offset).toBeGreaterThanOrEqual(0);
    expect(dropOffset(3, 3).offset).toBeLessThan(1e-3);
  });

  it("flips through edge-on and swaps the face halfway", () => {
    expect(flipPose(0).angle).toBe(0);
    expect(flipPose(0.34).swapped).toBe(false);
    expect(flipPose(0.34).angle).toBeGreaterThan(1.2);
    const after = flipPose(0.36);
    expect(after.swapped).toBe(true);
    expect(after.angle).toBeLessThan(-1.2);
    const end = flipPose(0.7);
    expect(end.done).toBe(true);
    expect(end.angle).toBeCloseTo(0);
  });

  it("hashes strings into 0…1 stably", () => {
    expect(hash01("t12")).toBe(hash01("t12"));
    expect(hash01("t12")).not.toBe(hash01("t13"));
    expect(hash01("")).toBeGreaterThanOrEqual(0);
    expect(hash01("x")).toBeLessThan(1);
  });
});
