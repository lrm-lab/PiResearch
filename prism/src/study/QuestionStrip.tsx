// The question strip (DESIGN.md §4): everything a first-time viewer needs before reading the map.
// The question, the phase, a segmented progress bar, the agent roster, one plain summary line, and
// the report button.

import { BookOpen01 } from "@untitledui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { goalActivity, phaseLabel } from "../lib/activity";
import { TONE_CLASS } from "../lib/status";
import type { Snapshot } from "../types/api";
import { AgentAvatar } from "../ui/AgentAvatar";
import { ModelTag } from "../ui/ModelMark";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { agentRoster, progressSegments, TONE_LABEL } from "./model";
import { Skeleton } from "./primitives";
import { PrismMark } from "./starmap/PrismMark";
import { summaryParts } from "./starmap/summary";
import { useStudy } from "./store";
import { useStudyUi } from "./ui";

export function QuestionStrip({ view }: { view: Snapshot | null }) {
  if (!view) return <StripSkeleton />;
  if (!view.ok) return <WaitingStrip view={view} />;
  return <ReadyStrip view={view} />;
}

function ReadyStrip({ view }: { view: Snapshot }) {
  const setTab = useStudy((s) => s.setTab);
  const setFocusAgent = useStudyUi((s) => s.setFocusAgent);
  const question = (view.goal?.title ?? "").trim();
  const activity = goalActivity(view);
  const running = view.running === true;
  const segments = useMemo(() => progressSegments(view), [view]);
  const roster = useMemo(() => agentRoster(view), [view]);
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      if (!expanded) setOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [question, expanded]);

  const parts = summaryParts(view);
  const shown = roster.slice(0, 5);
  const more = roster.length - shown.length;

  return (
    <section aria-label="研究问题" className="relative z-10 shrink-0 border-b border-secondary bg-primary px-4 py-4 sm:px-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p ref={textRef} className={cx("text-md leading-6 font-semibold text-primary", !expanded && "line-clamp-2")}>
            {question || "（没有记录研究问题）"}
          </p>
          {(overflow || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-0.5 rounded text-sm font-semibold text-brand-secondary outline-none hover:text-brand-tertiary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {expanded ? "收起" : "展开"}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ModelTag id={view.model} />
          <Badge color={activity || running ? "brand" : "gray"} dot={running && !activity}>
            <span className={cx(activity && "prism-shimmer")}>{phaseLabel(view)}</span>
          </Badge>
          {view.report && (
            <Button color="secondary" size="sm" iconLeading={BookOpen01} onClick={() => setTab("report")} className="max-sm:hidden">
              阅读报告
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="img"
          aria-label={segments.map((s) => `${TONE_LABEL[s.tone]} ${s.count}`).join("，")}
          className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-tertiary sm:w-56"
        >
          {segments.map((s) => (
            <span
              key={s.tone}
              className={cx("h-full min-w-1.5 rounded-full transition-[flex-grow] duration-500 ease-[var(--ease-out-quint)]", TONE_CLASS[s.tone].dot, s.tone === "progress" && running && "animate-pulse")}
              style={{ flexGrow: s.count / Math.max(total, 1), flexBasis: 0 }}
            />
          ))}
        </div>
        <p role="status" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-tertiary tabular">
          {parts.map((part, i) => (
            <span key={part} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-quaternary">·</span>}
              {part}
            </span>
          ))}
        </p>
        <div className="ml-auto flex items-center gap-3">
          {view.report && (
            <Button color="secondary" size="xs" iconLeading={BookOpen01} onClick={() => setTab("report")} className="sm:hidden">
              阅读报告
            </Button>
          )}
          {roster.length > 0 && (
            <div className="flex -space-x-1" role="group" aria-label={`${roster.length} 个智能体`}>
              {shown.map((entry) => (
                <span
                  key={entry.agent}
                  tabIndex={0}
                  onPointerEnter={() => setFocusAgent(entry.agent)}
                  onPointerLeave={() => setFocusAgent(null)}
                  onFocus={() => setFocusAgent(entry.agent)}
                  onBlur={() => setFocusAgent(null)}
                  className="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <AgentAvatar name={entry.agent} tone={entry.tone} size="xs" ring />
                </span>
              ))}
              {more > 0 && (
                <span className="relative inline-flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-tertiary ring-[1.5px] ring-[var(--color-bg-primary)]">
                  +{more}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A run with no graph yet (or at all): the strip alone says what is going on. */
function WaitingStrip({ view }: { view: Snapshot }) {
  // A snapshot without a graph and without `running: false` is a run that has just started.
  const running = view.running !== false;
  return (
    <section aria-label="研究问题" className="relative z-10 shrink-0 border-b border-secondary bg-primary px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <PrismMark active={running} className="size-4" />
        <div className="min-w-0 flex-1">
          <p className={cx("text-md font-semibold text-primary", running && "prism-shimmer")}>{running ? "正在等待派发任务" : "这份运行没有任务图"}</p>
          <p className="text-sm text-tertiary">{view.message || (running ? "智能体拆解问题后，任务会出现在这里。" : "这次运行没有留下可以展示的任务。")}</p>
        </div>
      </div>
    </section>
  );
}

function StripSkeleton() {
  return (
    <div aria-hidden="true" className="shrink-0 border-b border-secondary bg-primary px-4 py-4 sm:px-6">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-[min(36rem,80%)]" />
          <Skeleton className="h-5 w-[min(22rem,50%)]" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="h-1.5 w-56 rounded-full" />
        <Skeleton className="h-4 w-72 max-w-[50%]" />
      </div>
    </div>
  );
}
