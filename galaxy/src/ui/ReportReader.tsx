// Report reader with the "landing": the camera dives into the core, the screen
// washes to warm white and a paper sheet rises in. Closing reverses it.

import { AnimatePresence, motion, useScroll } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent, type RefObject } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchReport, studyApiPrefix } from "../lib/api";
import { selectionHeading } from "../lib/heading";
import { useFocusTrap } from "../lib/hooks";
import { isUsableTitle, prepareUserReport } from "../lib/report";
import { useGalaxy } from "../store";
import { IconClose, IconExternal } from "./icons";
import { alignNumericColumns, stripLeadingTitle } from "./reportTables";
import { useUi } from "./uiStore";

const EASE = [0.22, 1, 0.36, 1] as const;
const REMARK_PLUGINS = [remarkGfm];

type Loaded = { kind: "loading" } | { kind: "ready"; markdown: string } | { kind: "message"; text: string };

export function ReportReader() {
  const stage = useUi((state) => state.reportStage);
  const reportClosed = useUi((state) => state.reportClosed);
  const reduced = useGalaxy((state) => state.reducedMotion);

  return (
    <div className="report-layer">
      <AnimatePresence>
        {stage === "diving" && !reduced && (
          <motion.div
            key="flare"
            className="report-flare"
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1.6 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.95, ease: [0.45, 0, 0.85, 0.6] }}
          />
        )}
      </AnimatePresence>
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

function Dialog() {
  const studyId = useGalaxy((state) => state.studyId);
  const prefix = studyId ? studyApiPrefix(studyId) : null;
  const goalTitle = useGalaxy((state) => (state.view?.ok ? state.view.goal?.title : undefined));
  const endReport = useUi((state) => state.endReport);
  const [title] = useState(() => reportTitle(goalTitle));
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!prefix) return;
    const controller = new AbortController();
    fetchReport(prefix, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.kind === "missing") return setLoaded({ kind: "message", text: result.message });
        const markdown = alignNumericColumns(stripLeadingTitle(prepareUserReport(result.markdown, title), title));
        setLoaded(markdown.trim() ? { kind: "ready", markdown } : { kind: "message", text: "这份运行还没有报告。" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ kind: "message", text: "报告没有读出来。刷新后再打开一次。" });
      });
    return () => controller.abort();
  }, [prefix, title]);

  return (
    <motion.div
      className="report-wash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, delay: 0.18, ease: "easeIn" } }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div
        className="report-stage"
        style={{ pointerEvents: "auto" }}
        onClick={(event: MouseEvent) => {
          if (event.target === event.currentTarget) endReport();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="galaxy-report-title"
          className="report-paper"
          initial={{ opacity: 0, y: 70, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.98, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              endReport();
            }
          }}
        >
          <header className="report-head">
            <div className="report-head-copy">
              <span className="report-kicker">
                研究报告
                {loaded.kind === "ready" && <span className="report-meta"> · {readingMeta(loaded.markdown)}</span>}
              </span>
              <h2 id="galaxy-report-title" className="report-title" title={title}>
                {title}
              </h2>
            </div>
            <button ref={closeRef} type="button" className="report-close" aria-label="关闭报告" onClick={endReport}>
              <IconClose />
            </button>
            <motion.span className="report-progress" aria-hidden="true" style={{ scaleX: scrollYProgress }} />
          </header>
          <div ref={scrollRef} className="report-scroll">
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
      </div>
    </motion.div>
  );
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
        <nav className="report-toc" aria-label="章节目录">
          <p>目录</p>
          <ol>
            {outline.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active === item.id ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ block: "start" });
                  }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <article ref={articleRef} className="prose-paper">
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
    const label = headerLabels(node as HastLike | undefined);
    return (
      <div className="table-wrap" role="region" tabIndex={0} aria-label={label}>
        <table {...rest}>{children}</table>
      </div>
    );
  },
};
