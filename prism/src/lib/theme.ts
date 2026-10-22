// Theme follows the host. CoForge owns the light/dark switch, so Prism has no toggle of its own:
//   1. `?theme=light|dark` in the URL (an iframe src set by the host) wins and is kept for the tab;
//   2. then a `postMessage` from the parent window: {type: "coforge:theme", theme: "light"|"dark"}
//      (also accepted: {type: "theme", value}). The choice is kept for the tab in sessionStorage;
//   3. otherwise `prefers-color-scheme`, live.
// The `.dark-mode` class on <html> is CoForge's own switch name (tokens.css).

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "prism-theme";
const listeners = new Set<() => void>();
let current: Theme = readInitial();

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function systemTheme(): Theme {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function urlTheme(): Theme | null {
  if (typeof location === "undefined") return null;
  const value = new URLSearchParams(location.search).get("theme");
  return isTheme(value) ? value : null;
}

function storedTheme(): Theme | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function readInitial(): Theme {
  const fromUrl = urlTheme();
  if (fromUrl) {
    // A host-set theme lasts for the tab, so in-app navigation keeps it.
    try {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      // Private mode or no browser: the URL still applies to this page.
    }
  }
  return fromUrl ?? storedTheme() ?? systemTheme();
}

/** Parses a host message into a theme, or null when it is not a theme message. */
export function themeFromMessage(data: unknown): Theme | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.type === "coforge:theme" && isTheme(record.theme)) return record.theme;
  if (record.type === "theme" && isTheme(record.value)) return record.value;
  return null;
}

function apply(theme: Theme, animate: boolean): void {
  if (theme === current && document.documentElement.classList.contains("dark-mode") === (theme === "dark")) return;
  current = theme;
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  }
  root.classList.toggle("dark-mode", theme === "dark");
  for (const listener of listeners) listener();
}

let started = false;

/** Wire the URL / message / system sources once, at boot. */
export function startThemeSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  apply(current, false);
  const pinned = urlTheme() !== null;
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || window.parent === window) return;
    const theme = themeFromMessage(event.data);
    if (!theme) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode: the choice just lasts for this page.
    }
    apply(theme, true);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (pinned || storedTheme()) return;
    apply(systemTheme(), true);
  });
}

export function getTheme(): Theme {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current theme; re-renders when the host or the system switches it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
