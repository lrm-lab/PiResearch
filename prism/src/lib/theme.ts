// Theme precedence (highest first):
//   1. `?theme=light|dark` in the URL (an iframe src set by the host); kept for the tab;
//   2. a `postMessage` from the parent window: {type: "coforge:theme", theme: "light"|"dark"}
//      (also accepted: {type: "theme", value}); kept for the tab in sessionStorage;
//   3. the visitor's own choice from the header control (亮色 / 暗色 / 跟随系统), kept in
//      localStorage `prism-theme-choice`;
//   4. `prefers-color-scheme`, live.
// Under 1 and 2 the host owns the theme, so `useThemePinned()` is true and the header hides its control.
// The pre-paint script in index.html applies the same rules.
// The `.dark-mode` class on <html> is CoForge's own switch name (tokens.css).

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";

const STORAGE_KEY = "prism-theme"; // sessionStorage: URL / host theme, for this tab
export const CHOICE_KEY = "prism-theme-choice"; // localStorage: the visitor's own choice
const listeners = new Set<() => void>();
let choice: ThemeChoice = storedChoice();
let pinned = false;
let current: Theme = readInitial();

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** The precedence above, as a pure function. `host` is the URL or host-message theme, if any. */
export function resolveTheme(host: Theme | null, userChoice: ThemeChoice, system: Theme): Theme {
  return host ?? (userChoice === "system" ? system : userChoice);
}

function storedChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return isThemeChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

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
  const host = fromUrl ?? storedTheme();
  pinned = host !== null;
  return resolveTheme(host, choice, systemTheme());
}

/** Parses a host message into a theme, or null when it is not a theme message. */
export function themeFromMessage(data: unknown): Theme | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.type === "coforge:theme" && isTheme(record.theme)) return record.theme;
  if (record.type === "theme" && isTheme(record.value)) return record.value;
  return null;
}

function emit(): void {
  for (const listener of listeners) listener();
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
  emit();
}

/** The visitor's header choice. Ignored while the URL or the host pins the theme (the control is hidden then). */
export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  try {
    localStorage.setItem(CHOICE_KEY, next);
  } catch {
    // Private mode: the choice lasts for this page.
  }
  if (!pinned && typeof document !== "undefined") apply(resolveTheme(null, choice, systemTheme()), true);
  emit();
}

let started = false;

/** Wire the URL / message / system sources once, at boot. */
export function startThemeSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  apply(current, false);
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || window.parent === window) return;
    const theme = themeFromMessage(event.data);
    if (!theme) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode: the choice just lasts for this page.
    }
    pinned = true;
    apply(theme, true);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (pinned || choice !== "system") return;
    apply(systemTheme(), true);
  });
  // Another tab changed the choice.
  window.addEventListener("storage", (event) => {
    if (event.key !== CHOICE_KEY) return;
    choice = storedChoice();
    if (!pinned) apply(resolveTheme(null, choice, systemTheme()), true);
    emit();
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

/** The header control's value: light, dark or system. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice, () => choice);
}

/** True while the URL or the host decides the theme, so the visitor's choice has no effect. */
export function useThemePinned(): boolean {
  return useSyncExternalStore(subscribe, () => pinned, () => pinned);
}
