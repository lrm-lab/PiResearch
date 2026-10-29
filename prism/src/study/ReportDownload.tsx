// "下载" on the report: a menu of PDF / Word / Markdown. Choosing one builds the file in the browser;
// the button then morphs to a check with a soft brand pulse before settling back.

import { Check, ChevronDown, Download01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { downloadReport, type ReportExport, type ReportFormat } from "../lib/reportExport";
import { cx } from "../ui/cx";
import { EASE_OUT, Popover } from "./primitives";
import { useStudy } from "./store";

const FORMATS: { format: ReportFormat; label: string; ext: string; tint: string }[] = [
  { format: "pdf", label: "PDF", ext: "PDF", tint: "text-error-primary" },
  { format: "doc", label: "Word 文档", ext: "DOC", tint: "text-brand-secondary" },
  { format: "md", label: "Markdown", ext: "MD", tint: "text-secondary" },
];

type Phase = "idle" | "working" | "done";

export function ReportDownload({
  getReport,
  compact = false,
  side = "bottom",
}: {
  /** Reads the report at click time (the article element only exists once the document rendered). */
  getReport: () => ReportExport | null;
  /** Icon-only, for the floating action next to 回到顶部. */
  compact?: boolean;
  side?: "bottom" | "top";
}) {
  const reducedMotion = useStudy((state) => state.reducedMotion);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function choose(format: ReportFormat) {
    const report = getReport();
    setOpen(false);
    if (!report) return;
    clearTimeout(timer.current);
    setPhase("working");
    try {
      await downloadReport(format, report);
      setPhase("done");
      timer.current = setTimeout(() => setPhase("idle"), 2200);
    } catch {
      setPhase("idle");
    }
  }

  const done = phase === "done";
  const icon = done ? "check" : "download";

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label="下载报告"
      side={side}
      className="w-56 p-1.5"
      trigger={
        <motion.button
          type="button"
          aria-label={compact ? "下载报告" : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={phase === "working"}
          onClick={() => setOpen((value) => !value)}
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          className={cx(
            "relative isolate inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold shadow-xs ring-1 ring-primary outline-none ring-inset transition-colors",
            "hover:bg-primary_hover hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-wait",
            compact ? "size-9 shadow-lg" : "h-9 pr-2.5 pl-3",
            done ? "text-success-primary" : "text-secondary",
          )}
        >
          {done && !reducedMotion && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 -z-10 rounded-lg ring-2 ring-fg-brand-primary"
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.35 }}
              transition={{ duration: 0.7, ease: EASE_OUT }}
            />
          )}
          <span className="relative inline-flex size-5 items-center justify-center overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={icon}
                className="absolute inset-0 inline-flex items-center justify-center"
                initial={reducedMotion ? false : { y: icon === "check" ? 10 : -10, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={reducedMotion ? undefined : { y: icon === "check" ? -10 : 10, opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
              >
                {done ? (
                  <Check aria-hidden="true" className="size-5" />
                ) : (
                  <Download01 aria-hidden="true" className={cx("size-5", phase === "working" && "animate-pulse")} />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          {!compact && (
            <>
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={done ? "done" : "label"}
                  initial={reducedMotion ? false : { opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={reducedMotion ? undefined : { opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.22 }}
                >
                  {done ? "已下载" : "下载"}
                </motion.span>
              </AnimatePresence>
              <ChevronDown
                aria-hidden="true"
                className={cx("size-4 text-fg-quaternary transition-transform duration-200", open && "rotate-180")}
              />
            </>
          )}
        </motion.button>
      }
    >
      <div role="menu" aria-label="下载报告">
        {FORMATS.map((item, index) => (
          <motion.button
            key={item.format}
            type="button"
            role="menuitem"
            onClick={() => void choose(item.format)}
            initial={reducedMotion ? false : { opacity: 0, x: side === "top" ? 0 : 6, y: side === "top" ? 4 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.22, delay: 0.03 + index * 0.035, ease: EASE_OUT }}
            className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm font-medium text-secondary outline-none hover:bg-primary_hover hover:text-primary focus-visible:bg-primary_hover"
          >
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-[10px] font-semibold tracking-wide shadow-xs ring-1 ring-border-secondary ring-inset transition-transform duration-200 group-hover:-translate-y-px",
                item.tint,
              )}
            >
              {item.ext}
            </span>
            {item.label}
          </motion.button>
        ))}
      </div>
    </Popover>
  );
}
