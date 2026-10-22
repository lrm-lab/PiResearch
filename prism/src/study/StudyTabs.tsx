// The header tabs: the same look as src/ui/Tabs (CoForge underline tabs pressed onto the header's
// bottom border) plus what the study page needs on top: a disabled tab that still explains itself
// in a tooltip (aria-disabled keeps it focusable) and a shortcut hint.

import { motion } from "motion/react";
import { useId, type ComponentType, type SVGProps } from "react";
import { cx } from "../ui/cx";
import { Tooltip } from "./primitives";

export interface StudyTabItem<K extends string> {
  id: K;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number | string;
  disabled?: boolean;
  /** Tooltip text (shown for disabled tabs, or as the shortcut hint). */
  hint?: string;
  shortcut?: string;
}

export function StudyTabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly StudyTabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  label: string;
}) {
  const layoutId = useId();
  const enabled = items.filter((item) => !item.disabled);

  return (
    <div role="tablist" aria-label={label} className="flex h-full items-stretch gap-5">
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        const button = (
          <button
            role="tab"
            type="button"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            aria-keyshortcuts={item.shortcut}
            tabIndex={active ? 0 : -1}
            data-tab={item.id}
            onClick={() => !item.disabled && onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const index = enabled.findIndex((tab) => tab.id === value);
              const step = event.key === "ArrowRight" ? 1 : enabled.length - 1;
              const next = enabled[(Math.max(0, index) + step) % enabled.length];
              if (!next) return;
              onChange(next.id);
              (event.currentTarget.closest('[role="tablist"]')?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
            }}
            className={cx(
              "relative flex h-full items-center gap-2 px-1 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:text-brand-secondary",
              active ? "text-brand-secondary" : "text-quaternary hover:text-secondary",
              item.disabled && "cursor-not-allowed opacity-50 hover:text-quaternary",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="size-5" />}
            {item.label}
            {item.badge !== undefined && item.badge !== 0 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular ring-1 ring-border-secondary ring-inset">
                {item.badge}
              </span>
            )}
            {item.disabled && item.hint && <span className="sr-only">（{item.hint}）</span>}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg-brand-primary"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
          </button>
        );
        return item.hint ? (
          <Tooltip key={item.id} label={item.hint} shortcut={item.disabled ? undefined : item.shortcut} className="h-full">
            {button}
          </Tooltip>
        ) : (
          <span key={item.id} className="inline-flex h-full">
            {button}
          </span>
        );
      })}
    </div>
  );
}
