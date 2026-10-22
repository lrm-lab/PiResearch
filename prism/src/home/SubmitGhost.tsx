// The submit flight. After a successful POST a ghost card crystallises over the composer (blur and
// scale reveal), then moves into the first slot of the 进行中 grid through a shared layout
// animation (`layoutId`), the grid making room for it, and the page leaves for the new study.
// A watchdog navigates anyway if an animation never reports back.

import { useEffect } from "react";
import { motion } from "motion/react";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { flags, navigate } from "./flags";
import { useHome, type Pending } from "./store";

export const PENDING_LAYOUT_ID = "prism-pending-study";
const WATCHDOG_MS = 4500;
const LAND_PAUSE_MS = 420;

let finishing: string | null = null;

/** Leave for the new study once (or, with ?navigate=0, clear the ghost after a moment). */
export function finishPending(href: string): void {
  if (finishing === href) return;
  finishing = href;
  navigate(href);
  if (flags.stay) {
    setTimeout(() => {
      finishing = null;
      if (useHome.getState().pending?.href === href) useHome.getState().setPending(null);
    }, 1500);
  }
}

/** bfcache restore: allow another flight. */
export function resetPending(): void {
  finishing = null;
}

/** The forming study, as a CoForge card: a crystal on a tinted desk, the question, 进行中. */
export function GhostCard({ question, className }: { question: string; className?: string }) {
  return (
    <div
      className={cx(
        "prism-beam relative overflow-hidden rounded-xl border border-secondary bg-primary shadow-lg [--beam-from:var(--color-status-progress)] [--beam-to:var(--color-brand-400)]",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-primary">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-border-secondary)_1.2px,transparent_1.2px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 120 80" className="h-20 w-30" aria-hidden="true">
            <path d="M66 46 L118 22" className="home-ray stroke-status-progress" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M66 48 L118 40" className="home-ray stroke-status-done" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M66 50 L118 58" className="home-ray stroke-status-todo" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M2 52 L46 46" className="home-ray stroke-brand-300" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M48 14 L72 62 L24 62 Z" className="fill-brand-200/70 stroke-brand-500" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M48 14 L54 62" className="stroke-brand-400" strokeWidth="1" opacity="0.7" />
          </svg>
        </div>
        <p className="absolute inset-x-0 bottom-3 text-center text-xs text-tertiary">
          <span className="prism-shimmer">正在组建研究团队</span>
        </p>
      </div>
      <div className="border-t border-secondary p-4">
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-primary">{question}</p>
        <div className="mt-3 flex items-center gap-2">
          <Badge color="progress" dot size="xs">
            进行中
          </Badge>
          <span className="ml-auto font-mono text-xs text-quaternary tabular">刚刚</span>
        </div>
      </div>
    </div>
  );
}

/** Width of a grid card, so the ghost forms close to the size it lands at (capped, so on a phone
 *  it forms inside the hero instead of covering it; the flight scales it to the slot). */
function cardWidth(): number {
  const card = document.querySelector<HTMLElement>("[data-study-card], [data-pending-slot]");
  return Math.min(288, Math.round(card?.getBoundingClientRect().width ?? 288));
}

/** Over the composer while the ghost forms. */
export function SubmitGhost() {
  const pending = useHome((state) => state.pending);
  // One watchdog per submitted study (keyed by href, not by phase changes).
  const href = pending?.href ?? null;
  useEffect(() => {
    if (!href) return;
    const timer = setTimeout(() => {
      if (useHome.getState().pending?.href === href) finishPending(href);
    }, WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [href]);
  if (pending?.phase !== "crystal") return null;
  return <Crystal pending={pending} />;
}

function Crystal({ pending }: { pending: Pending }) {
  const width = cardWidth();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-center">
      <motion.div
        layoutId={PENDING_LAYOUT_ID}
        style={{ width }}
        initial={{ opacity: 0, scale: 0.8, filter: "blur(16px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => {
          const current = useHome.getState().pending;
          if (current?.href === pending.href && current.phase === "crystal") {
            useHome.getState().setPending({ ...current, phase: "fly" });
          }
        }}
      >
        <GhostCard question={pending.question} className="shadow-xl" />
      </motion.div>
    </div>
  );
}

/** The reserved first slot in the 进行中 grid; the ghost lands here. */
export function PendingSlot({ pending }: { pending: Pending }) {
  return (
    <motion.div
      layoutId={PENDING_LAYOUT_ID}
      data-pending-slot
      transition={{ type: "spring", stiffness: 140, damping: 22, mass: 1 }}
      onLayoutAnimationComplete={() => setTimeout(() => finishPending(pending.href), LAND_PAUSE_MS)}
      className="relative z-10"
    >
      <GhostCard question={pending.question} />
    </motion.div>
  );
}

