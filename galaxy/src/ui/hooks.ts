// HUD-only hooks: the sheet breakpoint and the global shortcuts.
// Store-free hooks live in src/lib/hooks.ts and src/lib/media.ts.

import { useEffect } from "react";
import { useGalaxy } from "../store";
import { useUi } from "./uiStore";

/** ≤900 px: the detail panel is a bottom sheet. */
export const SHEET_QUERY = "(max-width: 900px)";

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** V lens · F core · R overview · ? help · Esc closes menus, then the selection. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;
      const ui = useUi.getState();
      if (ui.reportStage !== "closed") {
        // The dialog handles Esc itself; this covers focus that slipped to <body>.
        if (event.key === "Escape") ui.endReport();
        return;
      }
      const galaxy = useGalaxy.getState();
      if (event.key === "Escape") {
        if (ui.menu) {
          ui.setMenu(null);
          event.preventDefault();
          return;
        }
        if (galaxy.selectedId) {
          ui.closeDetail();
          event.preventDefault();
        }
        return;
      }
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "v") galaxy.toggleLens();
      else if (key === "f") galaxy.emitCamera({ kind: "core" });
      else if (key === "r") galaxy.emitCamera({ kind: "overview" });
      else if (event.key === "?") ui.toggleMenu("help");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
