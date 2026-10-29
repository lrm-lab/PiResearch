// "下载" in the report dialog head: a glass menu of PDF / Word / Markdown. The file is built in the
// browser; the button then flips to a cyan check with a ring that ripples out before settling back.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { downloadReport, type ReportExport, type ReportFormat } from "../lib/reportExport";
import { useGalaxy } from "../store";
import { IconCheck, IconChevronDown, IconDownload } from "./icons";
import { MenuPopover } from "./Menu";

const TRIGGER_ID = "galaxy-report-download";

const FORMATS: { format: ReportFormat; label: string; ext: string }[] = [
  { format: "pdf", label: "PDF", ext: "PDF" },
  { format: "doc", label: "Word 文档", ext: "DOC" },
  { format: "md", label: "Markdown", ext: "MD" },
];

type Phase = "idle" | "working" | "done";

export function ReportDownload({ getReport }: { getReport: () => ReportExport | null }) {
  const reducedMotion = useGalaxy((state) => state.reducedMotion);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Close on a click outside the trigger and menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

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

  return (
    <span className="relative report-download" ref={ref}>
      <button
        id={TRIGGER_ID}
        type="button"
        className="g-btn g-btn-toggle report-download-btn"
        data-done={done || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={phase === "working"}
        onClick={() => setOpen((value) => !value)}
      >
        {done && !reducedMotion && (
          <motion.span
            aria-hidden="true"
            className="report-download-ripple"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 1.45 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <span className="report-download-icon">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={done ? "check" : "download"}
              initial={reducedMotion ? false : { y: done ? 10 : -10, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { y: done ? -10 : 10, opacity: 0, scale: 0.6 }}
              transition={{ type: "spring", stiffness: 520, damping: 30 }}
            >
              {done ? <IconCheck /> : <IconDownload />}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="btn-label">
          {done ? "已下载" : "下载"}
        </span>
        <span className="report-download-chevron" data-open={open || undefined} aria-hidden="true">
          <IconChevronDown />
        </span>
      </button>
      <MenuPopover open={open} label="下载报告" onClose={() => setOpen(false)} triggerId={TRIGGER_ID} className="g-menu report-download-menu">
        {FORMATS.map((item, index) => (
          <motion.button
            key={item.format}
            type="button"
            role="menuitem"
            className="g-menu-item"
            initial={reducedMotion ? false : { opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: 0.03 + index * 0.035, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => void choose(item.format)}
          >
            <span className="report-download-ext" data-format={item.format} aria-hidden="true">
              {item.ext}
            </span>
            {item.label}
          </motion.button>
        ))}
      </MenuPopover>
    </span>
  );
}
