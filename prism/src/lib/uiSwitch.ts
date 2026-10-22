// The frontend preference shared by the three PiResearch frontends (same origin, one localStorage key).
// The mapping below is mirrored in galaxy/src/lib/uiSwitch.ts, in galaxy/index.html / prism/index.html
// (entry redirect) and in galaxy/serve.py (switcher injected into the 2D pages). Keep them in step.

import { APP_BASE } from "./api";

export type UiChoice = "galaxy" | "prism" | "2d";

export const UI_KEY = "piresearch-ui";

export const UI_OPTIONS: readonly { id: UiChoice; name: string; label: string }[] = [
  { id: "galaxy", name: "Galaxy", label: "星系" },
  { id: "prism", name: "Prism", label: "棱镜" },
  { id: "2d", name: "2D", label: "经典" },
];

export function isUiChoice(value: unknown): value is UiChoice {
  return value === "galaxy" || value === "prism" || value === "2d";
}

/** Home, or the same study when `studyId` is given. Ids keep their slashes. */
export function uiHref(ui: UiChoice, studyId?: string | null): string {
  const id = studyId ? studyId.replace(/^\/+|\/+$/g, "") : "";
  if (ui === "galaxy") return id ? `/galaxy/study/${id}` : "/galaxy/";
  if (ui === "prism") return id ? `${APP_BASE}study/${id}` : APP_BASE;
  return id ? `/study/${id}` : "/index.html";
}

export function readUi(): UiChoice | null {
  try {
    const value = localStorage.getItem(UI_KEY);
    return isUiChoice(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveUi(ui: UiChoice): void {
  try {
    localStorage.setItem(UI_KEY, ui);
  } catch {
    // Private mode: the switch still navigates, it just is not remembered.
  }
}
