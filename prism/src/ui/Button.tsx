// CoForge's button language (Untitled UI): 36px `sm` is the product default, one `primary` per
// surface, `secondary` for the rest, red only for irreversible actions (docs/design/color-status-typography.md).

import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type SVGProps } from "react";
import { cx } from "./cx";

export type ButtonColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "link-gray"
  | "link-color"
  | "primary-destructive"
  | "secondary-destructive"
  | "tertiary-destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  size?: ButtonSize;
  iconLeading?: Icon;
  iconTrailing?: Icon;
  isLoading?: boolean;
  /** Keep the label visible next to the spinner while loading. */
  showTextWhileLoading?: boolean;
  children?: ReactNode;
}

const SIZE: Record<ButtonSize, string> = {
  xs: "h-8 gap-1 rounded-lg px-2.5 text-xs font-semibold",
  sm: "h-9 gap-1 rounded-lg px-3 text-sm font-semibold",
  md: "h-10 gap-1 rounded-lg px-3.5 text-sm font-semibold",
  lg: "h-11 gap-1.5 rounded-lg px-4 text-md font-semibold",
};

const ICON_ONLY: Record<ButtonSize, string> = {
  xs: "size-8 rounded-lg",
  sm: "size-9 rounded-lg",
  md: "size-10 rounded-lg",
  lg: "size-11 rounded-lg",
};

const COLOR: Record<ButtonColor, string> = {
  primary:
    "bg-brand-solid text-white shadow-xs ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover before:absolute before:inset-px before:rounded-[7px] before:border before:border-white/12 before:mask-b-from-0%",
  secondary:
    "bg-primary text-secondary shadow-xs ring-1 ring-primary ring-inset hover:bg-primary_hover hover:text-primary",
  tertiary: "text-tertiary hover:bg-primary_hover hover:text-secondary",
  "link-gray": "h-auto! px-0! text-tertiary hover:text-secondary",
  "link-color": "h-auto! px-0! text-brand-secondary hover:text-brand-tertiary",
  "primary-destructive": "bg-error-solid text-white shadow-xs hover:bg-error-solid_hover",
  "secondary-destructive":
    "bg-primary text-error-primary shadow-xs ring-1 ring-error ring-inset hover:bg-error-primary",
  "tertiary-destructive": "text-error-primary hover:bg-error-primary",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    color = "secondary",
    size = "sm",
    iconLeading: Leading,
    iconTrailing: Trailing,
    isLoading = false,
    showTextWhileLoading = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  const iconOnly = !children;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center whitespace-nowrap outline-none transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        COLOR[color],
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <svg className="size-5 animate-spin" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        Leading && <Leading aria-hidden="true" className="size-5 shrink-0 opacity-80" />
      )}
      {children && (!isLoading || showTextWhileLoading) && <span className="px-0.5">{children}</span>}
      {Trailing && !isLoading && <Trailing aria-hidden="true" className="size-5 shrink-0 opacity-80" />}
    </button>
  );
});
