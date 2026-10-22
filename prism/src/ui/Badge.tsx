// CoForge badges: brand = public/selected, grey = default, task tones for status.
import type { ReactNode } from "react";
import type { TaskTone } from "../lib/status";
import { TONE_CLASS } from "../lib/status";
import { cx } from "./cx";

export type BadgeColor = "gray" | "brand" | TaskTone;

const COLOR: Record<"gray" | "brand", string> = {
  gray: "bg-secondary text-secondary ring-secondary",
  brand: "bg-brand-primary text-brand-secondary ring-brand-200 dark:ring-brand-800",
};

export function Badge({
  color = "gray",
  dot = false,
  size = "sm",
  className,
  children,
}: {
  color?: BadgeColor;
  dot?: boolean;
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
}) {
  const tone = color === "gray" || color === "brand" ? null : TONE_CLASS[color];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "xs" ? "h-5 px-2 text-xs" : "h-6 px-2.5 text-xs",
        tone ? tone.badge : COLOR[color as "gray" | "brand"],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cx("size-1.5 rounded-full", tone ? tone.dot : "bg-fg-quaternary")} />}
      {children}
    </span>
  );
}
