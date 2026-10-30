// The study list under the composer: a 44px toolbar (underline tabs 全部 / 进行中 / 已完成 / 未完成
// with counts, and a title search) over a responsive grid of cards. Also the loading skeleton, the
// inline error banner and the CoForge empty state (featured icon, title, line, example chips that
// fill the composer). Filtering animates with layout; a submitted question appears as a card on top.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, SearchLg, Telescope, XClose } from "@untitledui/icons";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ModelTag } from "../ui/ModelMark";
import type { TabItem } from "../ui/Tabs";
import { EXAMPLE_CHIPS } from "./examples";
import { rowTitle } from "./format";
import { MiniMap } from "./MiniMap";
import { refreshHistoryNow } from "./polling";
import { useHome } from "./store";
import { BEAM_CLASS, CARD_CLASS, cardMotion, LiveDot, StudyCard } from "./StudyCard";

type Filter = "all" | "running" | "finished" | "failed";

const GRID = "grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]";

export function Studies({ scroller }: { scroller: HTMLElement | null }) {
  const rows = useHome((state) => state.rows);
  const loadError = useHome((state) => state.loadError);
  const pending = useHome((state) => state.pending);
  const [filter, setFilter] = useState<Filter>("all");
  const thumbs = useHome((state) => state.thumbs);
  const [query, setQuery] = useState("");

  // Cards present on the first load enter with a short stagger; later ones just appear.
  const firstIds = useRef<Set<string> | null>(null);
  if (rows && firstIds.current === null) firstIds.current = new Set(rows.map((row) => row.id));
  useEffect(() => {
    if (!rows) return;
    const timer = setTimeout(() => (firstIds.current = new Set()), 1400);
    return () => clearTimeout(timer);
  }, [rows === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: 0, running: 0, finished: 0, failed: 0 };
    for (const row of rows ?? []) {
      c.all += 1;
      c[row.status] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) => (filter === "all" || row.status === filter) && (!needle || rowTitle(row).toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);

  if (!rows) {
    return <div className="mt-6 pb-10">{loadError ? <ErrorBanner message={loadError} /> : <Skeletons />}</div>;
  }
  if (!rows.length && !pending) return <EmptyState />;

  const tabs: TabItem<Filter>[] = [
    { id: "all", label: "全部", badge: counts.all },
    { id: "running", label: "进行中", badge: counts.running },
    { id: "finished", label: "已完成", badge: counts.finished },
    { id: "failed", label: "未完成", badge: counts.failed },
  ];
  const showPending = !!pending && (filter === "all" || filter === "running") && !query.trim();
  // The wide card goes to the first study that actually has a graph to show.
  const featuredId = filter === "all" && !query.trim() && visible.length > 3 ? visible.find((row) => thumbs[row.id]?.ok && (thumbs[row.id]?.nodes?.length ?? 0) > 1)?.id : undefined;
  const empty = visible.length === 0 && !showPending;

  return (
    <div className="pb-12">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-primary/90 py-1 backdrop-blur sm:h-12 sm:flex-nowrap sm:gap-4 sm:py-0">
        <FilterPills items={tabs} value={filter} onChange={setFilter} />
        <label className="relative my-auto block w-full shrink-0 sm:w-56">
          <SearchLg aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-quaternary" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题"
            aria-label="按标题搜索研究"
            className="h-9 w-full appearance-none rounded-full border border-secondary bg-primary pr-3 pl-8 text-sm text-primary shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-quaternary hover:border-primary focus:border-brand focus:shadow-[0_0_0_3px_var(--color-bg-brand-primary)] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>
      <div className="relative mt-5">
        <motion.div layout="position" className={GRID}>
          <AnimatePresence mode="popLayout" initial>
            {showPending && <PendingCard key={`pending-${pending!.href}`} question={pending!.question} model={pending!.model} />}
            {visible.map((row, index) => (
              <StudyCard
                key={row.id}
                row={row}
                scroller={scroller}
                featured={row.id === featuredId}
                delay={firstIds.current?.has(row.id) ? Math.min(index, 11) * 0.045 : 0}
              />
            ))}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {empty && (
            <motion.div
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="flex flex-col items-center py-16 text-center"
            >
              <p className="text-md font-semibold text-primary">没有符合条件的研究</p>
              <p className="mt-1 text-sm text-tertiary">换个关键词，或者清除筛选。</p>
              <Button
                color="secondary"
                size="sm"
                iconLeading={XClose}
                className="mt-4"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                清除筛选
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The card of a question that was just submitted, before the study page opens. */
function PendingCard({ question, model, ref }: { question: string; model?: string; ref?: React.Ref<HTMLElement> }) {
  return (
    <motion.article
      ref={ref}
      layout="position"
      {...cardMotion()}
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cx(CARD_CLASS, BEAM_CLASS)}
    >
      <div className="overflow-hidden rounded-t-[11px] border-b border-secondary">
        <MiniMap thumb={undefined} running noGraph={false} />
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
        <h3 className="line-clamp-2 min-h-12 text-md font-semibold text-primary">{question}</h3>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Badge color="progress" size="xs">
            <LiveDot />
            进行中
          </Badge>
          <ModelTag id={model} />
          <span className="ml-auto text-xs text-tertiary">刚刚提交</span>
        </div>
      </div>
    </motion.article>
  );
}

function Skeletons() {
  return (
    <div aria-busy="true" aria-label="正在读取研究">
      <div className="-mt-6 flex h-11 items-center gap-6 border-b border-secondary">
        {[40, 52, 52, 52].map((w, index) => (
          <div key={index} className="home-skeleton h-4 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className={cx(GRID, "mt-5")}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
            <div className="home-skeleton aspect-[320/176] rounded-none border-b border-secondary" />
            <div className="p-4">
              <div className="home-skeleton h-4 w-11/12 rounded" />
              <div className="home-skeleton mt-2 h-4 w-2/3 rounded" />
              <div className="mt-6 flex items-center gap-2">
                <div className="home-skeleton h-5 w-16 rounded-full" />
                <div className="home-skeleton ml-auto h-4 w-24 rounded" />
              </div>
              <div className="home-skeleton mt-3 h-1 w-full rounded-full" />
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
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-16 flex max-w-lg flex-col items-center px-4 pb-12 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-fg-secondary shadow-xs ring-1 ring-secondary ring-inset">
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
            className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-sm font-medium text-secondary shadow-xs ring-1 ring-primary ring-inset transition-colors outline-none hover:bg-primary_hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}


/** Filter chips: one light track, the active chip is a white pill that springs between slots. */
function FilterPills<K extends string>({ items, value, onChange }: { items: readonly TabItem<K>[]; value: K; onChange: (id: K) => void }) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label="筛选研究" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-secondary p-1">
      {items.map((item) => {
        const active = item.id === value;
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
              const index = items.findIndex((entry) => entry.id === value);
              const next = items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]!;
              onChange(next.id);
              (event.currentTarget.parentElement?.querySelector(`[data-pill="${next.id}"]`) as HTMLElement | null)?.focus();
            }}
            data-pill={item.id}
            className={cx(
              "relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring",
              active ? "text-brand-secondary" : "text-tertiary hover:text-secondary",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-primary shadow-xs ring-1 ring-secondary ring-inset"
              />
            )}
            <span className="relative">{item.label}</span>
            {item.badge !== undefined && item.badge !== 0 && (
              <span className={cx("relative rounded-full px-1.5 text-xs tabular", active ? "bg-brand-primary text-brand-secondary" : "bg-primary/60 text-quaternary")}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
