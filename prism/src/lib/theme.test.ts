import { describe, expect, it } from "vitest";
import { getTheme, isThemeChoice, resolveTheme, themeFromMessage } from "./theme";

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

  it("resolves the precedence: host > saved choice > system", () => {
    expect(resolveTheme("dark", "light", "light")).toBe("dark");
    expect(resolveTheme("light", "dark", "dark")).toBe("light");
    expect(resolveTheme(null, "dark", "light")).toBe("dark");
    expect(resolveTheme(null, "light", "dark")).toBe("light");
    expect(resolveTheme(null, "system", "dark")).toBe("dark");
    expect(resolveTheme(null, "system", "light")).toBe("light");
  });

  it("accepts only the three choices", () => {
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("auto")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});
