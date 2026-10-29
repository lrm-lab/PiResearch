// Where a study sits in a line of research: the study it continues and the studies that continued it.

import { CornerUpLeft, GitBranch01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { useState } from "react";
import { prismStudyHref } from "../../lib/api";
import { selectionHeading } from "../../lib/heading";
import { cx } from "../../ui/cx";
import type { FollowupLink, StudyLink } from "../../types/api";
import { Popover } from "../primitives";

const DOT: Record<FollowupLink["status"], string> = {
  running: "bg-status-progress animate-pulse",
  finished: "bg-status-done",
  failed: "bg-status-error",
};

const CHIP =
  "inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-secondary px-2 text-xs font-medium text-tertiary ring-1 ring-border-secondary outline-none ring-inset transition-colors hover:bg-tertiary hover:text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring";

export function LineageChips({
  parent,
  followups,
  popKey = 0,
  className,
}: {
  parent: StudyLink | null;
  followups: readonly FollowupLink[];
  /** Bumps to make the follow-up chip pop (a study just started from this report). */
  popKey?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!parent && !followups.length) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      {parent && (
        <a href={prismStudyHref(parent.id)} className={CHIP} title={parent.title}>
          <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="shrink-0">接续自</span>
          <span className="truncate text-secondary">{selectionHeading(parent.title, true)}</span>
        </a>
      )}
      {followups.length > 0 && (
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          label="后续研究"
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)] p-1.5"
          trigger={
            <motion.button
              key={popKey}
              type="button"
              data-lineage-chip
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              initial={popKey ? { scale: 0.7 } : false}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 14 }}
              className={cx(CHIP, popKey > 0 && "text-brand-secondary ring-fg-brand-primary/40")}
            >
              <GitBranch01 aria-hidden="true" className="size-3.5" />
              后续研究
              <span className="tabular rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 font-semibold text-secondary">{followups.length}</span>
            </motion.button>
          }
        >
          <ul role="menu" aria-label="后续研究">
            {followups.map((item) => (
              <li key={item.id} role="none">
                <a
                  role="menuitem"
                  href={prismStudyHref(item.id)}
                  className="flex items-start gap-2.5 rounded-md px-2 py-2 text-sm text-secondary outline-none hover:bg-primary_hover hover:text-primary focus-visible:bg-primary_hover"
                >
                  <span aria-hidden="true" className={cx("mt-1.5 size-2 shrink-0 rounded-full", DOT[item.status])} />
                  <span className="line-clamp-2">{selectionHeading(item.title, true)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}
