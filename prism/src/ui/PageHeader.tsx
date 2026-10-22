// CoForge's page header: 48px, `text-lg font-semibold` title on the left with optional meta,
// tabs centred on the header row (pressed onto its bottom border), actions on the right. Narrow
// containers drop the tabs to a second row.
import type { ReactNode } from "react";
import { cx } from "./cx";

export function PageHeader({
  leading,
  title,
  meta,
  tabs,
  actions,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("@container relative z-20 shrink-0 border-b border-secondary bg-primary", className)}>
      <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
        {leading}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="truncate text-lg font-semibold text-primary">{title}</h1>
          {meta && <span className="hidden shrink-0 text-sm text-tertiary tabular @md:inline">{meta}</span>}
        </div>
        {tabs && <div className="absolute inset-y-0 left-1/2 hidden -translate-x-1/2 @3xl:flex">{tabs}</div>}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex h-11 justify-center border-t border-secondary @3xl:hidden">{tabs}</div>}
    </header>
  );
}
