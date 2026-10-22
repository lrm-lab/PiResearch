// The study list under the hero: 进行中 and 已完成 sections as responsive card grids, with
// skeletons while history loads, an inline error banner when it cannot be read, and the CoForge
// empty state (featured icon, title, description, example chips that fill the composer).

import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Telescope } from "@untitledui/icons";
import type { HistoryRow } from "../types/api";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { EXAMPLE_CHIPS } from "./examples";
import { splitRows } from "./format";
import { refreshHistoryNow } from "./polling";
import { useHome, type Pending } from "./store";
import { PendingSlot } from "./SubmitGhost";
import { StudyCard } from "./StudyCard";

const GRID = "relative grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] sm:gap-5";

export function Studies({ webgl, scroller }: { webgl: boolean; scroller: HTMLElement | null }) {
  const rows = useHome((state) => state.rows);
  const loadError = useHome((state) => state.loadError);
  const pending = useHome((state) => state.pending);
  const flying = pending?.phase === "fly" ? pending : null;

  if (!rows) {
    return (
      <div className="mt-8">
        {loadError ? <ErrorBanner message={loadError} /> : <Skeletons />}
      </div>
    );
  }
  if (!rows.length && !flying) return <EmptyState />;

  const { running, done } = splitRows(rows);
  return (
    <div className="mt-8 flex flex-col gap-10 pb-8">
      {(running.length > 0 || flying) && (
        <Section title="进行中" count={running.length + (flying ? 1 : 0)} live rows={running} webgl={webgl} scroller={scroller} pending={flying} />
      )}
      {done.length > 0 && <Section title="已完成" count={done.length} rows={done} webgl={webgl} scroller={scroller} pending={null} />}
    </div>
  );
}

function Section({
  title,
  count,
  live = false,
  rows,
  webgl,
  scroller,
  pending,
}: {
  title: string;
  count: number;
  live?: boolean;
  rows: HistoryRow[];
  webgl: boolean;
  scroller: HTMLElement | null;
  pending: Pending | null;
}) {
  return (
    <motion.section layout="position" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        {live && (
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-status-progress opacity-60 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-status-progress" />
          </span>
        )}
        <h2 className="text-sm font-semibold text-secondary">{title}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-tertiary tabular ring-1 ring-secondary ring-inset">
          {count}
        </span>
      </div>
      <div className={GRID}>
        <AnimatePresence mode="popLayout" initial={false}>
          {pending && <PendingSlot key={`pending-${pending.href}`} pending={pending} />}
          {rows.map((row) => (
            <StudyCard key={row.id} row={row} webgl={webgl} scroller={scroller} />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function Skeletons() {
  return (
    <div aria-busy="true" aria-label="正在读取研究">
      <div className="home-skeleton mb-3 h-5 w-24 rounded-md" />
      <div className={GRID}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-secondary shadow-xs">
            <div className="home-skeleton aspect-[16/10]" />
            <div className="border-t border-secondary bg-primary p-4">
              <div className="home-skeleton h-4 w-11/12 rounded" />
              <div className="home-skeleton mt-2 h-4 w-2/3 rounded" />
              <div className="mt-4 flex items-center gap-2">
                <div className="home-skeleton h-5 w-16 rounded-full" />
                <div className="home-skeleton ml-auto h-4 w-24 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-error bg-error-primary px-4 py-3">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0 text-fg-error-primary" />
      <p className="min-w-0 flex-1 text-sm font-medium text-error-primary">{message}</p>
      <Button color="secondary" size="xs" onClick={refreshHistoryNow}>
        重试
      </Button>
    </div>
  );
}

function EmptyState() {
  const setPrefill = useHome((state) => state.setPrefill);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-14 flex max-w-lg flex-col items-center px-4 pb-12 text-center"
    >
      <div className="relative flex size-12 items-center justify-center rounded-xl bg-primary text-fg-secondary shadow-xs ring-1 ring-secondary ring-inset">
        <Telescope aria-hidden="true" className="size-6" />
      </div>
      <h2 className="mt-4 text-md font-semibold text-primary">还没有研究</h2>
      <p className="mt-1 max-w-md text-sm text-tertiary">在上方写下第一个问题，智能体会分头检索、核验，最后写成一份报告。也可以从一个例子开始：</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLE_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            title={chip.question}
            onClick={() => setPrefill(chip.question)}
            className={cx(
              "inline-flex h-8 items-center rounded-full bg-primary px-3 text-sm font-medium text-secondary shadow-xs ring-1 ring-primary ring-inset transition-colors",
              "outline-none hover:bg-primary_hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
