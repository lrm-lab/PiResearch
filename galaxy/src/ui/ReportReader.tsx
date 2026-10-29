// Report dialog over the study page: the galaxy keeps running behind a dimmed,
// blurred backdrop and the report opens in a HUD glass panel (short scale/fade).
// Also the "研究已完成 · 阅读报告" prompt shown once a study has finished.

import { AnimatePresence, motion, useMotionValue, type MotionValue } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchReport, studyApiPrefix } from "../lib/api";
import { selectionHeading } from "../lib/heading";
import { useFocusTrap } from "../lib/hooks";
import { isUsableTitle, prepareUserReport } from "../lib/report";
import type { ReportExport } from "../lib/reportExport";
import { useGalaxy } from "../store";
import { IconChevron, IconClose, IconExternal, IconReport } from "./icons";
import { ReportDownload } from "./ReportDownload";
import { alignNumericColumns, stripLeadingTitle } from "./reportTables";
import { useUi } from "./uiStore";

const EASE = [0.22, 1, 0.36, 1] as const;
const REMARK_PLUGINS = [remarkGfm];

type Loaded = { kind: "loading" } | { kind: "ready"; markdown: string } | { kind: "message"; text: string };

/** Per study (API prefix): the last report text and where the reader left off. */
const memory = new Map<string, { markdown?: string; scroll: number }>();

export function ReportReader() {
  const stage = useUi((state) => state.reportStage);
  const reportClosed = useUi((state) => state.reportClosed);

  return (
    <div className="report-layer" data-open={stage !== "closed"}>
      <AnimatePresence onExitComplete={reportClosed}>{stage === "open" && <Dialog key="dialog" />}</AnimatePresence>
    </div>
  );
}

function reportTitle(goalTitle: string | undefined): string {
  const title = String(goalTitle || "").trim();
  return isUsableTitle(title) ? selectionHeading(title, true) : "研究报告";
}

/** "3 章 · 约 4 分钟" (about 450 characters a minute). */
function readingMeta(markdown: string): string {
  const chapters = (markdown.match(/^## /gm) || []).length;
  const chars = markdown.replace(/[#>*|`\-\s]|\]\([^)]*\)/g, "").length;
  const minutes = Math.max(1, Math.round(chars / 450));
  return `${chapters ? `${chapters} 章 · ` : ""}约 ${minutes} 分钟`;
}

function prepare(markdown: string, title: string): string {
  return alignNumericColumns(stripLeadingTitle(prepareUserReport(markdown, title), title));
}

function Dialog() {
  const studyId = useGalaxy((state) => state.studyId);
  const prefix = studyId ? studyApiPrefix(studyId) : null;
  const goalTitle = useGalaxy((state) => (state.view?.ok ? state.view.goal?.title : undefined));
  const endReport = useUi((state) => state.endReport);
  const [title] = useState(() => reportTitle(goalTitle));
  const [loaded, setLoaded] = useState<Loaded>(() => {
    const cached = prefix ? memory.get(prefix)?.markdown : undefined;
    return cached ? { kind: "ready", markdown: cached } : { kind: "loading" };
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const progress = useReadProgress(scrollRef);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Fetch (again) on every open; a cached copy shows at once meanwhile.
  useEffect(() => {
    if (!prefix) return;
    const controller = new AbortController();
    fetchReport(prefix, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.kind === "missing") return setLoaded({ kind: "message", text: result.message });
        const markdown = prepare(result.markdown, title);
        if (!markdown.trim()) return setLoaded({ kind: "message", text: "这份运行还没有报告。" });
        const entry = memory.get(prefix) ?? { scroll: 0 };
        memory.set(prefix, { ...entry, markdown });
        setLoaded((current) => (current.kind === "ready" && current.markdown === markdown ? current : { kind: "ready", markdown }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoaded((current) => (current.kind === "ready" ? current : { kind: "message", text: "报告没有读出来。刷新后再打开一次。" }));
      });
    return () => controller.abort();
  }, [prefix, title]);

  // Remember where the reader was, and return there next time.
  const ready = loaded.kind === "ready";
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !prefix || !ready) return;
    const saved = memory.get(prefix)?.scroll ?? 0;
    if (saved > 0) {
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = saved;
      scroller.style.scrollBehavior = "";
    }
    const save = () => {
      const entry = memory.get(prefix) ?? { scroll: 0 };
      memory.set(prefix, { ...entry, scroll: scroller.scrollTop });
    };
    scroller.addEventListener("scroll", save, { passive: true });
    return () => scroller.removeEventListener("scroll", save);
  }, [prefix, ready]);

  const getReport = (): ReportExport | null => {
    const article = scrollRef.current?.querySelector<HTMLElement>(".prose-report");
    return loaded.kind === "ready" && article ? { title, markdown: loaded.markdown, article } : null;
  };

  return (
    <motion.div
      className="report-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }}
      transition={{ duration: 0.26, ease: "easeOut" }}
      onClick={(event: MouseEvent) => {
        if (event.target === event.currentTarget) endReport();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="galaxy-report-title"
        className="report-panel"
        initial={{ opacity: 0, scale: 0.965, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
        transition={{ duration: 0.32, ease: EASE }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            endReport();
          }
        }}
      >
        <header className="report-head">
          <span className="report-head-mark" aria-hidden="true">
            <IconReport />
          </span>
          <div className="report-head-copy">
            <span className="report-kicker">
              研究报告
              {loaded.kind === "ready" && <span className="report-meta"> · {readingMeta(loaded.markdown)}</span>}
            </span>
            <h2 id="galaxy-report-title" className="report-title" title={title}>
              {title}
            </h2>
          </div>
          {loaded.kind === "ready" && <ReportDownload getReport={getReport} />}
          <button ref={closeRef} type="button" className="g-btn g-btn-icon report-close" aria-label="关闭报告" aria-keyshortcuts="Escape" onClick={endReport}>
            <IconClose />
          </button>
          <span className="report-progress" aria-hidden="true">
            <motion.span style={{ scaleX: progress }} />
          </span>
        </header>
        <div ref={scrollRef} className="report-scroll g-scroll">
          {loaded.kind === "loading" && (
            <p className="report-status" role="status">
              <span className="spinner" aria-hidden="true" />
              正在读取报告
            </p>
          )}
          {loaded.kind === "message" && (
            <p className="report-status" role="status">
              {loaded.text}
            </p>
          )}
          {loaded.kind === "ready" && <Article markdown={loaded.markdown} scrollRef={scrollRef} />}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Scroll progress of the reader, re-measured when the content (not just the viewport) changes size. */
function useReadProgress(scrollRef: RefObject<HTMLDivElement | null>): MotionValue<number> {
  const progress = useMotionValue(0);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => {
      const range = scroller.scrollHeight - scroller.clientHeight;
      progress.set(range > 1 ? Math.min(1, Math.max(0, scroller.scrollTop / range)) : 0);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    const content = new MutationObserver(() => {
      observer?.disconnect();
      observer?.observe(scroller);
      if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
      update();
    });
    content.observe(scroller, { childList: true });
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer?.disconnect();
      content.disconnect();
    };
  }, [scrollRef, progress]);
  return progress;
}

interface OutlineItem {
  id: string;
  text: string;
}

function Article({ markdown, scrollRef }: { markdown: string; scrollRef: RefObject<HTMLDivElement | null> }) {
  const articleRef = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // Parse the Markdown once per report, not on every scroll-spy update.
  const content = useMemo(
    () => (
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {markdown}
      </Markdown>
    ),
    [markdown],
  );

  // Number chapters and collect the outline from the rendered headings.
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const chapters: OutlineItem[] = [];
    article.querySelectorAll<HTMLHeadingElement>("h2, h3").forEach((heading, index) => {
      heading.id = `report-section-${index}`;
      if (heading.tagName !== "H2") return;
      heading.dataset.index = String(chapters.length + 1).padStart(2, "0");
      chapters.push({ id: heading.id, text: heading.textContent?.trim() ?? "" });
    });
    // The outline lists chapters (h2) only, and only when there are at least two.
    setOutline(chapters.length >= 2 ? chapters : []);
  }, [markdown]);

  // Scroll spy for the outline.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !outline.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top + 90;
      let current: string | null = outline[0]?.id ?? null;
      for (const item of outline) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= top) current = item.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [outline, scrollRef]);

  return (
    <div className={`report-grid ${outline.length ? "has-toc" : ""}`}>
      {outline.length > 0 && (
        <nav className="report-toc g-scroll" aria-label="章节目录">
          <p className="g-kicker">目录</p>
          <ol>
            {outline.map((item, index) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active === item.id ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ block: "start" });
                  }}
                >
                  <span className="report-toc-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item.text}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <article ref={articleRef} className="prose-report">
        {content}
      </article>
    </div>
  );
}

interface HastLike {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastLike[];
}

function hastText(node: HastLike | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

function headerLabels(node: HastLike | undefined): string {
  const thead = node?.children?.find((child) => child.tagName === "thead");
  const row = thead?.children?.find((child) => child.tagName === "tr");
  const cells = (row?.children ?? []).filter((child) => child.tagName === "th").map((cell) => hastText(cell).trim());
  return cells.filter(Boolean).join("、") || "表格";
}

/**
 * A wide table scrolls sideways inside its own region; the clipped side(s)
 * fade out and a small hint says there is more, so nothing looks cut off.
 */
function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      const left = element.scrollLeft > 2;
      const right = element.scrollLeft < max - 2;
      setEdges((previous) => (previous.left === left && previous.right === right ? previous : { left, right }));
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  const overflow = edges.left || edges.right;
  return (
    <div className="table-frame" data-fade-left={edges.left} data-fade-right={edges.right}>
      <div ref={ref} className="table-wrap g-scroll" role="region" tabIndex={0} aria-label={overflow ? `${label}（可左右滚动）` : label}>
        {children}
      </div>
      {edges.right && (
        <button
          type="button"
          className="table-more"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.7, behavior: "smooth" })}
        >
          <IconChevron />
        </button>
      )}
    </div>
  );
}

const COMPONENTS: Components = {
  a({ node: _node, href, children, ...rest }) {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a href={href} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
        {external && <IconExternal className="ext" />}
      </a>
    );
  },
  table({ node, children, ...rest }: ComponentProps<"table"> & { node?: unknown }) {
    return (
      <TableScroll label={headerLabels(node as HastLike | undefined)}>
        <table {...rest}>{children}</table>
      </TableScroll>
    );
  },
};

/**
 * Bottom prompt once a study has finished and has a report, so the result is
 * never missed. Dismissable; opening the report also retires it.
 */
export function ReportCta() {
  const studyId = useGalaxy((state) => state.studyId);
  const finished = useGalaxy((state) => Boolean(state.view?.ok && state.view.running === false && state.view.report));
  const selected = useGalaxy((state) => state.selectedId !== null);
  const stage = useUi((state) => state.reportStage);
  const dismissed = useUi((state) => state.reportCtaDismissed);
  const beginReport = useUi((state) => state.beginReport);
  const dismiss = useUi((state) => state.dismissReportCta);
  const syncReportCta = useUi((state) => state.syncReportCta);

  useEffect(() => syncReportCta(studyId), [studyId, syncReportCta]);

  const show = finished && !dismissed && stage === "closed";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="cta"
          className="report-cta glass glass-pop glass-glow hud-auto"
          data-under-sheet={selected || undefined}
          role="region"
          aria-label="研究已完成"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.9, ease: EASE } }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
        >
          <button type="button" className="report-cta-open" onClick={beginReport}>
            <span className="report-cta-icon" aria-hidden="true">
              <IconReport />
            </span>
            <span className="report-cta-text">
              <span className="report-cta-done">研究已完成</span>
              <span className="report-cta-sep" aria-hidden="true">
                ·
              </span>
              <b>阅读报告</b>
            </span>
            <span className="report-cta-arrow" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
          <button type="button" className="report-cta-dismiss" aria-label="不再提示" title="不再提示" onClick={dismiss}>
            <IconClose />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
