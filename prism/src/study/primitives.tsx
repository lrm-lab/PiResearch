// Study-page building blocks that src/ui does not have yet: a link styled as a button, a tooltip,
// a popover card, keyboard caps, CoForge's featured icon and empty state, skeleton bars.

import { AnimatePresence, motion } from "motion/react";
import { useRef, type AnchorHTMLAttributes, type CSSProperties, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useDismiss } from "../lib/hooks";
import { cx } from "../ui/cx";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------
// LinkButton: navigation that looks like Button (`secondary` / `tertiary`, 36px `sm`).

const LINK_COLOR = {
  secondary:
    "bg-primary text-secondary shadow-xs ring-1 ring-border-primary ring-inset hover:bg-primary_hover hover:text-primary",
  tertiary: "text-tertiary hover:bg-primary_hover hover:text-secondary",
} as const;

export function LinkButton({
  color = "secondary",
  icon: Leading,
  iconOnly = false,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  color?: keyof typeof LINK_COLOR;
  icon?: Icon;
  /** Square 36px button; `children` become the accessible name only. */
  iconOnly?: boolean;
}) {
  return (
    <a
      className={cx(
        "relative inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg text-sm font-semibold whitespace-nowrap outline-none transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        iconOnly ? "w-9" : "px-3",
        LINK_COLOR[color],
        className,
      )}
      {...rest}
    >
      {Leading && <Leading aria-hidden="true" className="size-5 shrink-0 opacity-80" />}
      {iconOnly ? <span className="sr-only">{children}</span> : children && <span className="px-0.5">{children}</span>}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Tooltip: short, non-interactive text on hover and keyboard focus (progressive-disclosure.md).

const TIP_SIDE = {
  bottom: "top-full mt-2",
  top: "bottom-full mb-2",
  left: "right-full mr-2 top-1/2 -translate-y-1/2",
} as const;

const TIP_ALIGN = {
  center: "left-1/2 -translate-x-1/2",
  start: "left-0",
  end: "right-0",
} as const;

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  align = "center",
  className,
  children,
}: {
  label: ReactNode;
  shortcut?: string;
  side?: keyof typeof TIP_SIDE;
  align?: keyof typeof TIP_ALIGN;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute z-50 flex w-max max-w-64 items-center gap-2 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 dark:bg-neutral-800",
          "group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100",
          TIP_SIDE[side],
          side !== "left" && TIP_ALIGN[align],
        )}
      >
        {label}
        {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kbd

export function Kbd({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "inverse"; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 font-mono text-[0.6875rem] leading-none font-medium",
        tone === "inverse"
          ? "bg-white/15 text-white/80"
          : "bg-primary text-tertiary shadow-xs ring-1 ring-border-secondary ring-inset",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Popover: a CoForge menu card anchored to its trigger. Outside clicks close it; Esc is handled by
// the page shortcuts (they close popovers before anything else).

export function Popover({
  open,
  onClose,
  trigger,
  label,
  side = "bottom",
  align = "end",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  label: string;
  side?: "bottom" | "top";
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onClose);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: side === "bottom" ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === "bottom" ? -4 : 4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className={cx(
              "absolute z-40 rounded-xl bg-primary shadow-lg ring-1 ring-border-secondary",
              side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
              align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
              className,
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeaturedIcon (CoForge "modern": white tile, hairline, soft shadow) and the light round variant.

export function FeaturedIcon({
  icon: IconComponent,
  tone = "gray",
  size = "lg",
  className,
}: {
  icon: Icon;
  tone?: "gray" | "brand" | "warning" | "error" | "success";
  size?: "md" | "lg";
  className?: string;
}) {
  if (tone === "gray") {
    return (
      <span
        className={cx(
          "relative inline-flex shrink-0 items-center justify-center rounded-xl bg-primary text-fg-secondary shadow-xs ring-1 ring-border-primary ring-inset",
          size === "lg" ? "size-12" : "size-10 rounded-lg",
          className,
        )}
      >
        <IconComponent aria-hidden="true" className={size === "lg" ? "size-6" : "size-5"} />
      </span>
    );
  }
  const toneClass = {
    brand: "bg-brand-secondary text-brand-secondary dark:text-white",
    warning: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    error: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
    success: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
  }[tone];
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        size === "lg" ? "size-12" : "size-10",
        toneClass,
        className,
      )}
    >
      <IconComponent aria-hidden="true" className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState (empty-states.md): featured icon over a faint dot grid (the desk's grid), title,
// one-line description, actions.

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
  role,
}: {
  icon: Icon;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <motion.div
      role={role}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className={cx("mx-auto flex max-w-sm flex-col items-center px-6 text-center", className)}
    >
      <div className="relative mb-5 flex items-center justify-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-56 [background-image:radial-gradient(var(--color-border-primary)_1px,transparent_1.2px)] [background-size:14px_14px] opacity-70 [mask-image:radial-gradient(closest-side,black,transparent)]"
        />
        <FeaturedIcon icon={icon} />
      </div>
      <h2 className="relative text-md font-semibold text-primary">{title}</h2>
      {description && <p className="relative mt-1 text-sm text-tertiary">{description}</p>}
      {children && <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" style={style} className={cx("block animate-pulse rounded-md bg-tertiary", className)} />;
}

/** Small spinning ring (CoForge loading indicator). */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("size-4 shrink-0 animate-spin", className)} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
