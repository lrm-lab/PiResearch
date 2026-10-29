// 报告 tab: fetch the report, clean it with prepareUserReport and render it as a CoForge document.
// react-markdown + remark-gfm live in ReportMarkdown.tsx, loaded lazily as their own chunk.

import { AlertTriangle, ArrowUp, Dataflow03, FileX02, RefreshCw01 } from "@untitledui/icons";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { fetchReport, studyApiPrefix } from "../lib/api";
import { selectionHeading } from "../lib/heading";
import { isUsableTitle, prepareUserReport } from "../lib/report";
import type { ReportExport } from "../lib/reportExport";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Button } from "../ui/Button";
import { agentRoster, readingMeta } from "./model";
import { EASE_OUT, EmptyState, Skeleton } from "./primitives";
import { ReportDownload } from "./ReportDownload";
import { alignNumericColumns, stripLeadingTitle } from "./reportTables";
import { useStudy } from "./store";

const ReportMarkdown = lazy(() => import("./ReportMarkdown"));

type Loaded =
  | { kind: "loading" }
  | { kind: "ready"; markdown: string }
  | { kind: "missing"; message: string }
  | { kind: "error" };

/** Last loaded report per study, so switching tabs shows it at once (and revalidates behind). */
const cache = new Map<string, Extract<Loaded, { kind: "ready" | "missing" }>>();

function reportTitle(goalTitle: string | undefined): string {
  const title = String(goalTitle || "").trim();
  return isUsableTitle(title) ? selectionHeading(title, true) : "研究报告";
}

export function ReportView({ studyId }: { studyId: string }) {
  const goalTitle = useStudy((state) => (state.view?.ok ? state.view.goal?.title : undefined));
  const view = useStudy((state) => state.view);
  const setTab = useStudy((state) => state.setTab);
  const reducedMotion = useStudy((state) => state.reducedMotion);
  const title = reportTitle(goalTitle);
  const [loaded, setLoaded] = useState<Loaded>(() => cache.get(studyId) ?? { kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Reading progress, measured by hand so it also updates when the content grows (the lazy chunk
  // arriving, images, a refetch) and reads 0 while nothing scrolls.
  const ratio = useMotionValue(0);
  const progress = useSpring(ratio, { stiffness: 260, damping: 40, restDelta: 0.001 });
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = scroller.scrollHeight - scroller.clientHeight;
      ratio.set(range > 8 ? Math.min(1, scroller.scrollTop / range) : 0);
      setShowTop(scroller.scrollTop > 900);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(content);
    scroller.addEventListener("scroll", schedule, { passive: true });
    update();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ratio]);

  useEffect(() => {
    const controller = new AbortController();
    fetchReport(studyApiPrefix(studyId), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        let next: Extract<Loaded, { kind: "ready" | "missing" }>;
        if (result.kind === "missing") next = { kind: "missing", message: result.message };
        else {
          const markdown = alignNumericColumns(stripLeadingTitle(prepareUserReport(result.markdown, title), title));
          next = markdown.trim() ? { kind: "ready", markdown } : { kind: "missing", message: "这份运行还没有报告。" };
        }
        cache.set(studyId, next);
        setLoaded(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Keep a report already on screen; only an empty view shows the error.
        setLoaded((current) => (current.kind === "ready" ? current : { kind: "error" }));
      });
    return () => controller.abort();
  }, [studyId, title, attempt]);

  const roster = useMemo(() => agentRoster(view), [view]);
  const running = view?.running === true;

  const getReport = (): ReportExport | null => {
    const article = contentRef.current?.querySelector<HTMLElement>(".prism-doc");
    if (loaded.kind !== "ready" || !article) return null;
    return {
      title,
      markdown: loaded.markdown,
      article,
      byline: roster.length > 0 ? `由 ${roster.length} 个研究智能体完成` : undefined,
    };
  };

  const header =
    loaded.kind === "ready" ? (
      <motion.header
        initial={reducedMotion ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="mb-10 border-b border-secondary pb-8"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-brand-secondary">研究报告</span>
            <span aria-hidden="true" className="text-quaternary">
              ·
            </span>
            <span className="text-tertiary tabular">{readingMeta(loaded.markdown)}</span>
          </p>
          <ReportDownload getReport={getReport} />
        </div>
        <h1 className="mt-3 text-display-xs font-semibold tracking-tight text-balance text-primary md:text-display-sm">{title}</h1>
        {(roster.length > 0 || running) && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-tertiary">
            {roster.length > 0 && (
              <span className="inline-flex items-center gap-2.5">
                <span className="flex -space-x-1">
                  {roster.slice(0, 6).map((entry) => (
                    <AgentAvatar key={entry.agent} name={entry.agent} tone={entry.tone} size="xs" ring />
                  ))}
                </span>
                由 {roster.length} 个研究智能体完成
              </span>
            )}
            {running && (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-status-progress" />
                研究仍在进行，报告可能还会更新
              </span>
            )}
          </div>
        )}
      </motion.header>
    ) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {loaded.kind === "ready" && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 origin-left bg-brand-solid"
          style={{ scaleX: progress }}
        />
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
        <div ref={contentRef} className="flex min-h-full flex-col">
        {loaded.kind === "loading" && <DocSkeleton />}
        {loaded.kind === "missing" && (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState icon={FileX02} role="status" title="这份运行还没有报告" description={loaded.message}>
              <Button iconLeading={Dataflow03} onClick={() => setTab("map")}>
                回到任务图
              </Button>
            </EmptyState>
          </div>
        )}
        {loaded.kind === "error" && (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState icon={AlertTriangle} role="alert" title="报告没有读出来" description="网络或研究服务暂时没有响应。">
              <Button
                iconLeading={RefreshCw01}
                onClick={() => {
                  setLoaded({ kind: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                重试
              </Button>
            </EmptyState>
          </div>
        )}
        {loaded.kind === "ready" && (
          <Suspense fallback={<DocSkeleton />}>
            <ReportMarkdown markdown={loaded.markdown} header={header} scrollRef={scrollRef} />
          </Suspense>
        )}
        </div>
      </div>
      <AnimatePresence>
        {showTop && loaded.kind === "ready" && (
          <motion.div
            key="top"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute right-4 bottom-4 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6"
          >
            <ReportDownload getReport={getReport} compact side="top" />
            <Button
              color="secondary"
              iconLeading={ArrowUp}
              aria-label="回到顶部"
              className="shadow-lg"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The document's loading shape (also shown by the page before the first snapshot arrives). */
export function DocSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8" aria-hidden="true">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-4 h-8 w-4/5" />
      <Skeleton className="mt-2 h-8 w-2/5" />
      <div className="mt-10 space-y-3 border-t border-secondary pt-10">
        {[1, 0.94, 0.98, 0.7, 0, 0.92, 1, 0.86, 0.5].map((width, index) =>
          width ? <Skeleton key={index} className="h-4" style={{ width: `${width * 100}%` }} /> : <div key={index} className="h-4" />,
        )}
      </div>
    </div>
  );
}
