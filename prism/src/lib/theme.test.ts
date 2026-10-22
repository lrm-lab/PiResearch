import { describe, expect, it } from "vitest";
import { getTheme, themeFromMessage } from "./theme";

describe("theme", () => {
  it("reads CoForge's theme message and the short form", () => {
    expect(themeFromMessage({ type: "coforge:theme", theme: "dark" })).toBe("dark");
    expect(themeFromMessage({ type: "coforge:theme", theme: "light" })).toBe("light");
    expect(themeFromMessage({ type: "theme", value: "dark" })).toBe("dark");
  });

  it("ignores anything else", () => {
    expect(themeFromMessage(null)).toBeNull();
    expect(themeFromMessage("dark")).toBeNull();
    expect(themeFromMessage({ type: "coforge:theme", theme: "sepia" })).toBeNull();
    expect(themeFromMessage({ type: "other", theme: "dark" })).toBeNull();
  });

  it("defaults to light without a browser", () => {
    expect(getTheme()).toBe("light");
  });
});
