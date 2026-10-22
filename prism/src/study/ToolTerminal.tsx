// 工具步骤 as a dark terminal (DESIGN.md §4): stays dark in both themes, traffic-light header, one
// line per finished step (`$ 搜索 【查询】…`, hint dimmed, detail expandable, errors red, folded
// calls ×N), live calls typed at the bottom with a caret, 思考 as a shimmering "正在想下一步".
//
// The typing effect follows magicui's Terminal / TypingAnimation (MIT, © Magic UI; the CoForge copy
// lives in apps/web/src/components/magicui/terminal.tsx), reduced to one line that retypes when the
// call changes.

import { ChevronRight, RefreshCw01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOOL } from "../lib/activity";
import type { LoadState } from "./store";
import type { LiveCall, Step } from "../types/api";
import { cx } from "../ui/cx";
import { capNote, DETAIL_CAP, HINT_CAP } from "../lib/trajectory";
import { TERMINAL_TAIL } from "./model";

export function ToolTerminal({
  title,
  steps,
  live,
  state,
  reducedMotion,
  onRetry,
}: {
  title: string;
  steps: readonly Step[];
  live: readonly LiveCall[];
  state: LoadState;
  reducedMotion: boolean;
  onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showAll, setShowAll] = useState(false);
  // 全部展开 / 全部收起: `tick` re-applies `all` to rows the reader toggled by hand.
  const [expand, setExpand] = useState({ all: false, tick: 0 });
  const hiddenCount = showAll ? 0 : Math.max(0, steps.length - TERMINAL_TAIL);
  const shown = hiddenCount ? steps.slice(hiddenCount) : steps;
  const loadingEmpty = state === "loading" && !steps.length;

  // Follow the tail like a terminal, unless the reader scrolled up.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [steps.length, live, state]);

  return (
    <div className="overflow-hidden rounded-xl bg-terminal font-mono text-xs text-terminal shadow-md ring-1 ring-black/10 dark:ring-white/10">
      <div className="flex items-center gap-3 border-b border-white/8 px-3.5 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          <span className="size-2.5 rounded-full bg-yellow-500" />
          <span className="size-2.5 rounded-full bg-green-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-white/45">{title}</span>
        {steps.length > 0 && (
          <button
            type="button"
            aria-pressed={expand.all}
            onClick={() => setExpand((previous) => ({ all: !previous.all, tick: previous.tick + 1 }))}
            className="shrink-0 rounded-md px-2 py-0.5 text-white/70 outline-none ring-1 ring-white/15 hover:bg-white/8 hover:text-white focus-visible:ring-white/50"
          >
            {expand.all ? "全部收起" : "全部展开"}
          </button>
        )}
        <span className={cx("inline-flex w-12 items-center justify-end gap-1.5", live.length ? "text-green-400/90" : "text-white/50")}>
          {live.length > 0 ? (
            <>
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-green-400" />
              运行中
            </>
          ) : (
            "zsh"
          )}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        }}
        className="max-h-[26rem] overflow-y-auto overscroll-contain px-3.5 py-3 [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]"
        aria-busy={state === "loading"}
        aria-label="工具步骤"
        role="log"
        tabIndex={0}
      >
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mb-2 w-full rounded-md py-1 text-center text-white/40 outline-none hover:bg-white/5 hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/40"
          >
            显示更早的 {hiddenCount} 步
          </button>
        )}
        {shown.length > 0 && (
          <ol className="space-y-0.5">
            {shown.map((step, index) => (
              <StepLine key={`${hiddenCount + index}:${step.tool}:${step.label}`} step={step} expand={expand} />
            ))}
          </ol>
        )}
        {loadingEmpty && (
          <div role="status" className="space-y-2.5 py-1">
            <p className="text-white/45">
              <span className="text-brand-300">$</span> 正在读取工具步骤…
            </p>
            {[0.82, 0.64, 0.74].map((width, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="block h-3 animate-pulse rounded bg-white/8"
                style={{ width: `${width * 100}%`, animationDelay: `${index * 120}ms` }}
              />
            ))}
          </div>
        )}
        {state === "error" && (
          <p role="alert" className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-red-400", shown.length > 0 && "mt-2")}>
            <span>
              <span className="text-red-400/70">!</span> 工具步骤没有读出来
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-white/75 outline-none ring-1 ring-white/15 hover:bg-white/8 hover:text-white focus-visible:ring-white/50"
            >
              <RefreshCw01 aria-hidden="true" className="size-3.5" />
              重试
            </button>
          </p>
        )}
        {live.length > 0 && (
          <ul className={cx("space-y-1", (shown.length > 0 || loadingEmpty) && "mt-1.5")}>
            {live.map((call, index) => (
              <LiveLine key={`${index}:${call.tool}:${call.label}`} call={call} last={index === live.length - 1} reducedMotion={reducedMotion} />
            ))}
          </ul>
        )}
        {state === "ready" && !shown.length && !live.length && (
          <p className="text-white/40">
            <span className="text-brand-300">$</span> 还没有工具调用
          </p>
        )}
      </div>
    </div>
  );
}

function toolName(tool: string): string {
  return TOOL[tool] ?? tool;
}

function StepLine({ step, expand }: { step: Step; expand: { all: boolean; tick: number } }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (expand.tick) setOpen(expand.all);
  }, [expand]);
  const detail = step.detail?.trim();
  const hintNote = capNote(step.hint, HINT_CAP);
  const detailNote = capNote(detail, DETAIL_CAP);
  // Expandable when there is a result, or the one-line hint is long enough to be cut.
  const expandable = Boolean(detail) || Array.from(step.hint ?? "").length > 48;
  const count = step.count ?? 1;
  const body = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span aria-hidden="true" className={step.error ? "text-red-400" : "text-brand-300"}>
          {step.error ? "✗" : "$"}
        </span>
        <span className={cx("shrink-0", step.error ? "text-red-300/80" : "text-white/55")}>{toolName(step.tool)}</span>
        <span className={cx("min-w-0 flex-1 truncate", step.error ? "text-red-300" : "text-white/90")}>{step.label || step.tool}</span>
        {count > 1 && <span className="shrink-0 rounded bg-white/10 px-1 text-[0.6875rem] text-white/60 tabular">×{count}</span>}
        {step.error && <span className="shrink-0 rounded bg-red-500/15 px-1 text-[0.6875rem] text-red-300">失败</span>}
        {expandable && (
          <ChevronRight
            aria-hidden="true"
            className={cx("size-3.5 shrink-0 self-center text-white/30 transition-transform duration-150", open && "rotate-90")}
          />
        )}
      </span>
      {step.hint && (
        <span
          className={cx("block pl-[1.1rem] text-white/55", open ? "break-words whitespace-pre-wrap" : "truncate")}
          title={open ? undefined : step.hint}
        >
          {step.hint}
        </span>
      )}
    </>
  );
  return (
    <li>
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md px-1.5 py-1 text-left outline-none hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-white/30"
        >
          {body}
        </button>
      ) : (
        <div className="py-1">{body}</div>
      )}
      {open && hintNote && <p className="mb-1 ml-[1.1rem] pl-2.5 text-[0.6875rem] text-white/55">{hintNote}</p>}
      {detail && open && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.18 }}
          className={cx(
            "mb-1 ml-[1.1rem] overflow-hidden border-l pl-2.5 break-words whitespace-pre-wrap",
            step.error ? "border-red-400/40 text-red-300" : "border-white/15 text-white/75",
          )}
        >
          {detail}
        </motion.p>
      )}
      {detail && open && detailNote && <p className="mb-1 ml-[1.1rem] pl-2.5 text-[0.6875rem] text-white/55">{detailNote}</p>}
    </li>
  );
}

function LiveLine({ call, last, reducedMotion }: { call: LiveCall; last: boolean; reducedMotion: boolean }) {
  const thinking = call.tool === "思考";
  return (
    <li className="py-1">
      <span className="flex min-w-0 items-baseline gap-2">
        <span aria-hidden="true" className="relative top-[-1px] flex size-2 shrink-0 self-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-green-400/60 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-green-400" />
        </span>
        <span className="shrink-0 text-white/40">{toolName(call.tool)}</span>
        {thinking ? (
          <span className="prism-shimmer text-white/40 [--shimmer-contrast:var(--color-terminal-fg)]">{call.hint || "正在想下一步"}</span>
        ) : (
          <TypingText text={call.label || call.tool} className={cx("min-w-0 flex-1 text-white/90", last && "prism-caret")} reducedMotion={reducedMotion} />
        )}
        {call.count > 1 && <span className="shrink-0 rounded bg-white/10 px-1 text-[0.6875rem] text-white/60 tabular">×{call.count}</span>}
      </span>
      {!thinking && call.hint && <span className="block truncate pl-4 text-white/35">{call.hint}</span>}
    </li>
  );
}

/** Types `text` one character at a time; retypes when it changes. Full text under reduced motion. */
export function TypingText({
  text,
  className,
  reducedMotion,
  speed = 38,
}: {
  text: string;
  className?: string;
  reducedMotion: boolean;
  speed?: number;
}) {
  const chars = Array.from(text);
  const [count, setCount] = useState(reducedMotion ? chars.length : 0);

  useEffect(() => {
    if (reducedMotion) {
      setCount(Array.from(text).length);
      return;
    }
    const total = Array.from(text).length;
    setCount(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setCount(index);
      if (index >= total) window.clearInterval(timer);
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, reducedMotion, speed]);

  return (
    <span className={cx("break-words", className)} aria-label={text}>
      <span aria-hidden="true">{chars.slice(0, count).join("")}</span>
    </span>
  );
}
