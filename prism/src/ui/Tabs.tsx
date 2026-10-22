// CoForge's horizontal underline tabs (Untitled `underline`): the active tab's brand underline sits
// on the header's bottom border.
import { useId, type ComponentType, type SVGProps } from "react";
import { motion } from "motion/react";
import { cx } from "./cx";

export interface TabItem<K extends string> {
  id: K;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number | string;
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className={cx("flex h-full items-stretch gap-4", className)}>
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const index = items.findIndex((tab) => tab.id === value);
              const next = items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]!;
              onChange(next.id);
              (event.currentTarget.parentElement?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
            }}
            data-tab={item.id}
            className={cx(
              "relative flex items-center gap-2 px-1 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:text-brand-secondary",
              active ? "text-brand-secondary" : "text-quaternary hover:text-secondary",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="size-5" />}
            {item.label}
            {item.badge !== undefined && item.badge !== 0 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular ring-1 ring-secondary ring-inset">
                {item.badge}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg-brand-primary"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
