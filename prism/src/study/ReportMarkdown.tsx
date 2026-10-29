// The report document (lazy chunk: the only module that imports react-markdown and remark-gfm).
// Centred max-w-3xl article, a sticky table of contents (h2/h3) on wide screens with the current
// section highlighted.

import { LinkExternal01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import { cx } from "../ui/cx";
import { EASE_OUT } from "./primitives";
import "./report.css";

// remark-cjk-friendly: bold that touches CJK punctuation (是**“引号”**：) would otherwise show raw **.
export const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];

/**
 * Reports write meta blocks (研究对象/资料截止/说明…) as consecutive ">" lines; standard Markdown
 * joins them into one run-on paragraph. Add a hard break to each ">" line that is followed by
 * another, so every source line stays on its own line.
 */
export function breakBlockquoteLines(markdown: string): string {
  const lines = markdown.split("\n");
  let fence = false;
  return lines
    .map((line, index) => {
      if (/^\s*```/.test(line)) fence = !fence;
      if (fence || !/^\s*>/.test(line)) return line;
      if (!/^\s*>/.test(lines[index + 1] ?? "") || /\s{2}$|\\$/.test(line)) return line;
      return line + "  ";
    })
    .join("\n");
}

interface OutlineItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export default function ReportMarkdown({
  markdown,
  header,
  scrollRef,
  compact = false,
}: {
  markdown: string;
  header: ReactNode;
  /** Narrow reading column (the chat panel is open): no table of contents. */
  compact?: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // Parse once per report, not on every scroll-spy update.
  const content = useMemo(
    () => (
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {breakBlockquoteLines(markdown)}
      </Markdown>
    ),
    [markdown],
  );

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const items: OutlineItem[] = [];
    article.querySelectorAll<HTMLHeadingElement>("h2, h3").forEach((heading, index) => {
      heading.id = `report-section-${index}`;
      items.push({ id: heading.id, text: heading.textContent?.trim() ?? "", level: heading.tagName === "H2" ? 2 : 3 });
    });
    setOutline(items.filter((item) => item.level === 2).length >= 2 ? items : []);
  }, [markdown]);

  // Scroll spy: the last heading above the top third of the reader.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !outline.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.3;
      let current: string | null = outline[0]?.id ?? null;
      for (const item of outline) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= line) current = item.id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = outline[outline.length - 1]!.id;
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
    <div
      className={cx(
        "mx-auto grid max-w-[84rem] grid-cols-1 gap-x-10 px-5 pt-10 pb-32 sm:px-8",
        !compact && "xl:grid-cols-[minmax(0,1fr)_minmax(0,48rem)_minmax(0,1fr)]",
      )}
    >
      <div className={cx("mx-auto w-full max-w-3xl min-w-0", !compact && "xl:col-start-2")}>
        {header}
        <motion.article
          ref={articleRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE_OUT }}
          className="prism-doc"
        >
          {content}
        </motion.article>
      </div>
      {outline.length > 0 && !compact && (
        <nav aria-label="目录" className="sticky top-10 hidden max-h-[calc(100dvh-12rem)] self-start overflow-y-auto pb-4 xl:col-start-3 xl:block">
          <p className="mb-3 text-xs font-semibold text-tertiary">目录</p>
          <ol className="border-l border-secondary">
            {outline.map((item) => {
              const current = active === item.id;
              return (
                <li key={item.id} className="relative">
                  {current && (
                    <motion.span
                      layoutId="toc-active"
                      className="absolute inset-y-1 -left-px w-0.5 rounded-full bg-fg-brand-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <a
                    href={`#${item.id}`}
                    aria-current={current ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(item.id)?.scrollIntoView({ block: "start" });
                    }}
                    className={cx(
                      "block rounded-r-md py-1.5 pr-2 leading-snug outline-none transition-colors focus-visible:text-brand-secondary",
                      item.level === 2 ? "pl-3.5 text-sm" : "pl-6 text-xs",
                      current ? "font-medium text-brand-secondary" : "text-tertiary hover:text-secondary",
                    )}
                  >
                    {item.text}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
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

/** "年份、出让收入（亿元）、同比" for the table region's accessible name. */
function headerLabels(node: HastLike | undefined): string {
  const thead = node?.children?.find((child) => child.tagName === "thead");
  const row = thead?.children?.find((child) => child.tagName === "tr");
  const cells = (row?.children ?? []).filter((child) => child.tagName === "th").map((cell) => hastText(cell).trim());
  return cells.filter(Boolean).join("、") || "表格";
}

export function DocLink({ node: _node, href, children, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
  const external = Boolean(href && /^https?:\/\//i.test(href));
  return (
    <a href={href} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
      {external && <LinkExternal01 aria-hidden="true" className="prism-doc-ext" />}
    </a>
  );
}

export const COMPONENTS: Components = {
  a: DocLink,
  table({ node, children, ...rest }) {
    return (
      <div className="prism-doc-table" role="region" tabIndex={0} aria-label={headerLabels(node as HastLike | undefined)}>
        <table {...rest}>{children}</table>
      </div>
    );
  },
};
