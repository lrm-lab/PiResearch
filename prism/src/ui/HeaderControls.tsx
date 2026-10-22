// Header controls shared by the home and study pages: the frontend switch (Galaxy / Prism / 2D) and the
// theme control (亮色 / 暗色 / 跟随系统). Both are small segmented controls in CoForge's button style.

import { Monitor01, Moon01, Sun } from "@untitledui/icons";
import type { ComponentType, SVGProps } from "react";
import { setThemeChoice, useThemeChoice, useThemePinned, type ThemeChoice } from "../lib/theme";
import { saveUi, UI_OPTIONS, uiHref } from "../lib/uiSwitch";
import { cx } from "./cx";

const SEGMENT_GROUP = "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-primary p-0.5 shadow-xs ring-1 ring-border-primary ring-inset";
const SEGMENT =
  "relative inline-flex h-8 items-center justify-center gap-1 rounded-md text-sm font-semibold whitespace-nowrap outline-none transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const SEGMENT_ON = "bg-brand-primary text-brand-secondary";
const SEGMENT_OFF = "text-tertiary hover:bg-primary_hover hover:text-secondary";

/** Galaxy · Prism · 2D. Links; the click saves the preference, then the browser opens the same page there. */
export function UiSwitch({ studyId }: { studyId?: string | null }) {
  return (
    <nav aria-label="切换界面" className={SEGMENT_GROUP}>
      {UI_OPTIONS.map((option) => {
        const current = option.id === "prism";
        return (
          <a
            key={option.id}
            href={uiHref(option.id, studyId)}
            aria-current={current ? "page" : undefined}
            title={`${option.name} ${option.label}`}
            onClick={() => saveUi(option.id)}
            onAuxClick={() => saveUi(option.id)}
            className={cx(SEGMENT, "px-2.5", current ? SEGMENT_ON : SEGMENT_OFF)}
          >
            {option.name}
            <span className={cx("font-medium opacity-70 max-lg:hidden", current && "opacity-80")}>{option.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

const THEME_OPTIONS: readonly { id: ThemeChoice; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "light", label: "亮色", icon: Sun },
  { id: "system", label: "跟随系统", icon: Monitor01 },
  { id: "dark", label: "暗色", icon: Moon01 },
];

/** 亮色 / 暗色 / 跟随系统. Hidden while the URL or the CoForge host sets the theme. */
export function ThemeSwitch() {
  const choice = useThemeChoice();
  const pinned = useThemePinned();
  if (pinned) return null;
  // Phones: one button that cycles 亮色 → 暗色 → 跟随系统, to keep the header on one row.
  const index = THEME_OPTIONS.findIndex((option) => option.id === choice);
  const Current = THEME_OPTIONS[index]!.icon;
  const cycle = { light: "dark", dark: "system", system: "light" } as const;
  return (
    <>
    <button
      type="button"
      aria-label={`主题：${THEME_OPTIONS[index]!.label}，点击切换`}
      title={THEME_OPTIONS[index]!.label}
      onClick={() => setThemeChoice(cycle[choice])}
      className={cx(SEGMENT_GROUP, "w-9 justify-center text-tertiary outline-none hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:hidden")}
    >
      <Current aria-hidden="true" className="size-4" />
    </button>
    <div role="radiogroup" aria-label="主题" className={cx(SEGMENT_GROUP, "max-sm:hidden")}>
      {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
        const on = choice === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            tabIndex={on ? 0 : -1}
            onClick={() => setThemeChoice(id)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const index = THEME_OPTIONS.findIndex((option) => option.id === choice);
              const next = THEME_OPTIONS[(index + step + THEME_OPTIONS.length) % THEME_OPTIONS.length]!;
              setThemeChoice(next.id);
              (event.currentTarget.parentElement?.querySelector(`[data-theme-choice="${next.id}"]`) as HTMLElement | null)?.focus();
            }}
            data-theme-choice={id}
            className={cx(SEGMENT, "w-8", on ? SEGMENT_ON : SEGMENT_OFF)}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        );
      })}
    </div>
    </>
  );
}

export function HeaderControls({ studyId }: { studyId?: string | null }) {
  return (
    <>
      <UiSwitch studyId={studyId} />
      <ThemeSwitch />
    </>
  );
}
