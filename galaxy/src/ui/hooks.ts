// Small HUD hooks: media queries, global shortcuts, outside clicks and a focus trap.

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { useGalaxy } from "../store";
import { focusNodeLabel, useUi } from "./uiStore";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

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
        const selected = galaxy.selectedId;
        if (selected) {
          galaxy.select(null);
          ui.setSheetExpanded(false);
          focusNodeLabel(selected);
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

/** Closes the open menu on a pointer down outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [ref, open, close]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while `active`. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.offsetParent !== null || item === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const inside = ref.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ref, active]);
}

/** `navigator.onLine`, live. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
