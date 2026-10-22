import { describe, expect, it } from "vitest";
import { isUiChoice, readUi, uiHref } from "./uiSwitch";

describe("uiSwitch", () => {
  it("maps homes", () => {
    expect(uiHref("galaxy")).toBe("/galaxy/");
    expect(uiHref("prism")).toBe("/prism/");
    expect(uiHref("2d")).toBe("/index.html");
  });

  it("maps the same study, ids keep their slashes", () => {
    expect(uiHref("galaxy", "land/1")).toBe("/galaxy/study/land/1");
    expect(uiHref("prism", "sessions/20261020-101500/1")).toBe("/prism/study/sessions/20261020-101500/1");
    expect(uiHref("2d", "/land/1/")).toBe("/study/land/1");
    expect(uiHref("2d", "")).toBe("/index.html");
  });

  it("validates stored values", () => {
    expect(isUiChoice("prism")).toBe(true);
    expect(isUiChoice("3d")).toBe(false);
    expect(readUi()).toBeNull(); // no browser
  });
});
