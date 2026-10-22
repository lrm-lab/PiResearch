import { describe, expect, it } from "vitest";
import { BRAND, RELATION_HEX, STATUS_HEX, SURFACE } from "../lib/palette";
import { cardLook, hexToRgb, mixHex, relationColor, rgba, rgbToHex, SELECT_HEX } from "./colors";

describe("colour helpers", () => {
  it("round-trips hex and handles short and bad input", () => {
    expect(hexToRgb("#5d36dc")).toEqual([93, 54, 220]);
    expect(hexToRgb("fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("nope")).toEqual([0, 0, 0]);
    expect(rgbToHex([93, 54, 220])).toBe("#5d36dc");
    expect(rgbToHex([300, -4, 12.6])).toBe("#ff000d");
  });

  it("mixes and clamps", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mixHex("#123456", "#abcdef", 0)).toBe("#123456");
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });
});

describe("cardLook", () => {
  it("maps statuses onto CoForge task tones", () => {
    expect(cardLook("open", false, "light").tone).toBe("todo");
    expect(cardLook("in_progress", false, "light").tone).toBe("progress");
    expect(cardLook("resolved", false, "light").tone).toBe("done");
    expect(cardLook("cancelled", false, "light").tone).toBe("closed");
    expect(cardLook("in_progress", true, "light").tone).toBe("error");
    expect(cardLook("resolved", true, "light").tone).toBe("done");
  });

  it("open tasks are ghosts with a dashed outline; others are solid", () => {
    const ghost = cardLook("open", false, "light");
    expect(ghost.dashed).toBe(true);
    expect(ghost.faceAlpha).toBeLessThan(1);
    expect(ghost.slabOpacity).toBeLessThan(0.5);
    const solid = cardLook("resolved", false, "light");
    expect(solid.dashed).toBe(false);
    expect(solid.faceAlpha).toBe(1);
  });

  it("uses theme surfaces and status colours only; brand violet never appears", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const status of ["open", "in_progress", "resolved", "cancelled"]) {
        const look = cardLook(status, status === "in_progress", theme);
        expect(Object.values(STATUS_HEX)).toContain(look.ring);
        expect(look.ring).not.toBe(BRAND[600]);
      }
      expect(cardLook("resolved", false, theme).face).toBe(SURFACE[theme].card);
      expect(cardLook("resolved", false, theme).title).toBe(SURFACE[theme].ink);
    }
    expect(cardLook("in_progress", true, "dark").label).toBe(STATUS_HEX.error);
    expect(SELECT_HEX).toBe(BRAND[600]);
  });

  it("relation colours come from the palette", () => {
    expect(relationColor("fusion")).toBe(RELATION_HEX.audit);
    expect(relationColor("challenge")).toBe(STATUS_HEX.todo);
  });
});
