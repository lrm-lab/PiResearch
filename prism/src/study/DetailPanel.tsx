// The detail panel (DESIGN.md §4), one body in three shells:
//   overlay — desktop map: a CoForge slideout, 400px on the right, springing in over the star map;
//   column  — desktop task list: the column beside the narrowed list, divided by a 1px border;
//   sheet   — below `lg`: a draggable bottom sheet (peek / full, drag down to close).

import { BookOpen01, ChevronRight, Download01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { goalActivity, isErroneous, phaseLabel, progress, stateText, toolCount } from "../lib/activity";
import { headingPane } from "../lib/heading";
import { TONE_CLASS } from "../lib/status";
import type { ViewNode } from "../types/api";
import { AgentAvatar } from "../ui/AgentAvatar";
import { agentMood, MOOD_LABEL } from "../lib/mood";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { StatusIcon } from "../ui/StatusIcon";
import { agentRoster, nodeTone, progressSegments, relationsOf, TONE_LABEL } from "./model";
import { EASE_OUT, Tooltip } from "./primitives";
import { RelationDot } from "./relations";
import { findNode, useNodeDetail, useSelectedNode, useStudy } from "./store";
import { exportTask } from "./exportRun";
import { ToolTerminal } from "./ToolTerminal";
import { PANEL_WIDTH, useStudyUi } from "./ui";

export type PanelMode = "overlay" | "column" | "sheet";

const SPRING = { type: "spring", stiffness: 420, damping: 42, mass: 0.9 } as const;

export function DetailPanel({ mode, onSheetHeight }: { mode: PanelMode; onSheetHeight?: (height: number) => void }) {
  const node = useSelectedNode();
  return (
    <AnimatePresence initial={false}>
      {node && <PanelShell key={mode} mode={mode} node={node} onSheetHeight={onSheetHeight} />}
    </AnimatePresence>
  );
}

function PanelShell({ mode, node, onSheetHeight }: { mode: PanelMode; node: ViewNode; onSheetHeight?: (height: number) => void }) {
  // During the exit animation the store no longer has a selection: keep showing the last node.
  const live = useSelectedNode();
  const shown = live ?? node;
  const select = useStudy((state) => state.select);
  const close = () => select(null);

  const header = <PanelHeader node={shown} onClose={close} />;
  const body = (
    <motion.div
      key={shown.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      className={cx("px-4 pb-8 sm:px-6", mode === "column" && "max-w-[44rem]")}
    >
      {shown.goal ? <GoalBody /> : <TaskBody node={shown} />}
    </motion.div>
  );

  if (mode === "sheet") return <Sheet header={header} body={body} onClose={close} onHeight={onSheetHeight} label={panelLabel(shown)} />;

  if (mode === "overlay") {
    return (
      <motion.aside
        aria-label={panelLabel(shown)}
        initial={{ x: PANEL_WIDTH + 24 }}
        animate={{ x: 0 }}
        exit={{ x: PANEL_WIDTH + 24, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
        transition={SPRING}
        style={{ width: PANEL_WIDTH }}
        className="absolute inset-y-0 right-0 z-30 flex flex-col border-l border-secondary bg-primary shadow-xl"
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
      </motion.aside>
    );
  }

  return (
    <motion.aside
      aria-label={panelLabel(shown)}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
      className="flex min-w-0 flex-1 flex-col border-l border-secondary bg-primary"
    >
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
    </motion.aside>
  );
}

function panelLabel(node: ViewNode): string {
  return node.goal ? "研究主问题详情" : "任务详情";
}

// ---------------------------------------------------------------------------
// Bottom sheet

function Sheet({
  header,
  body,
  onClose,
  onHeight,
  label,
}: {
  header: ReactNode;
  body: ReactNode;
  onClose: () => void;
  onHeight?: (height: number) => void;
  label: string;
}) {
  const size = useStudyUi((state) => state.sheet);
  const setSheet = useStudyUi((state) => state.setSheet);
  const drag = useDragControls();
  const ref = useRef<HTMLElement>(null);

  // Report the settled height (not every animation frame) so the star map can pan the selection above it.
  useEffect(() => {
    const element = ref.current;
    if (!element || !onHeight) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onHeight(element.getBoundingClientRect().height), 140);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      onHeight(0);
    };
  }, [onHeight]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { y } = info.offset;
    const velocity = info.velocity.y;
    if (y < -40 || velocity < -500) setSheet("full");
    else if (size === "full" && (y > 60 || velocity > 500)) setSheet("peek");
    else if (size === "peek" && (y > 110 || velocity > 700)) onClose();
  }

  return (
    <motion.aside
      ref={ref}
      aria-label={label}
      initial={{ y: "100%" }}
      animate={{ y: 0, height: size === "full" ? "calc(100% - 0.75rem)" : "56%" }}
      exit={{ y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
      transition={SPRING}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.08, bottom: 0.5 }}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-secondary bg-primary shadow-xl"
    >
      <button
        type="button"
        aria-label={size === "full" ? "收起详情" : "展开详情"}
        aria-expanded={size === "full"}
        onPointerDown={(event) => drag.start(event)}
        onClick={() => setSheet(size === "full" ? "peek" : "full")}
        className="flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center outline-none active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-quaternary" />
      </button>
      <div onPointerDown={(event) => drag.start(event)} className="touch-none">
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
    </motion.aside>
  );
}

// ---------------------------------------------------------------------------
// Header

function PanelHeader({ node, onClose }: { node: ViewNode; onClose: () => void }) {
  const view = useStudy((state) => state.view);
  const tone = nodeTone(view, node);
  const pane = headingPane(node);
  return (
    <header className="flex shrink-0 items-start gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
      {node.goal ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs">
          <PrismGlyph className="size-4.5" />
        </span>
      ) : (
        <StatusIcon tone={tone} pulse={tone === "progress"} className="mt-1 size-5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-tertiary">
          {node.goal ? "研究主问题" : "研究任务"}
          {!node.goal && <span className="font-mono text-quaternary uppercase">{node.id}</span>}
        </p>
        <h2 className="mt-0.5 line-clamp-2 text-md font-semibold text-primary" title={pane.full}>
          {pane.heading}
        </h2>
      </div>
      <Button color="tertiary" size="sm" iconLeading={XClose} aria-label="关闭详情" aria-keyshortcuts="Escape" onClick={onClose} className="-mt-1 -mr-2" />
    </header>
  );
}

/** A small triangular prism mark for the goal (the star map's prism mark). */
function PrismGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M10 2.5 17.5 16H2.5L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 2.5 12 16" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Field rows (label left in tertiary, value right; lists drop below the label)

function Field({ label, count, stack = false, children }: { label: string; count?: number; stack?: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        "border-b border-secondary py-2.5 last:border-b-0",
        stack ? "flex flex-col gap-2" : "flex min-h-11 items-center justify-between gap-4",
      )}
    >
      <dt className="flex shrink-0 items-center gap-1.5 text-sm text-tertiary">
        {label}
        {count !== undefined && count > 0 && <span className="text-quaternary tabular">{count}</span>}
      </dt>
      <dd className={cx("min-w-0 text-sm font-medium text-primary", !stack && "text-right")}>{children}</dd>
    </div>
  );
}

function Section({ title, count, children, aside }: { title: string; count?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-primary">
        {title}
        {count !== undefined && count > 0 && <span className="font-medium text-quaternary tabular">{count}</span>}
        {aside && <span className="ml-auto">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

const EMPTY = <span className="font-normal text-quaternary">—</span>;

// ---------------------------------------------------------------------------
// Task

function TaskBody({ node }: { node: ViewNode }) {
  const view = useStudy((state) => state.view);
  const retryNode = useStudy((state) => state.retryNode);
  const reducedMotion = useStudy((state) => state.reducedMotion);
  const detail = useNodeDetail(node.id);
  const pane = headingPane(node);
  const tone = nodeTone(view, node);
  const relations = useMemo(() => relationsOf(view, node.id), [view, node.id]);
  const calls = toolCount(node);
  const notes = node.notes.trim();
  const state = detail?.state ?? (node.step_count ? "loading" : "ready");
  const ended = view?.running === false;

  return (
    <>
      {pane.showPane && (
        <details className="group mb-3 rounded-lg bg-secondary px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-secondary outline-none select-none [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="size-4 text-quaternary transition-transform group-open:rotate-90" />
            {pane.paneLabel}
            <span className="ml-auto text-xs font-normal text-quaternary tabular">{pane.lengthLabel}</span>
          </summary>
          <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-secondary">{pane.full}</p>
        </details>
      )}

      <dl>
        <Field label="状态">
          <Badge color={tone} dot>
            {stateText(view, node)}
          </Badge>
        </Field>
        <Field label="负责">
          {node.agents.length ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {node.agents.map((agent) => (
                <span key={agent} className="inline-flex items-center gap-2">
                  <AgentAvatar name={agent} tone={node.tone} size="xs" mood={agentMood(node)} />
                  {agent}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary">{MOOD_LABEL[agentMood(node)]}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="font-normal text-quaternary">{ended ? "未分配" : "待分配"}</span>
          )}
        </Field>
        <Field label="工具调用">
          <span className="font-mono text-secondary tabular">{calls ? `${calls} 次` : "—"}</span>
        </Field>
        <Field label="关联" count={relations.length} stack={relations.length > 0}>
          {relations.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {relations.map((link) => (
                <li key={`${link.relation}:${link.direction}:${link.other}`} className="min-w-0 max-w-full">
                  <LinkChip id={link.other}>
                    <RelationDot relation={link.relation} className="size-2" />
                    <span className="shrink-0 text-secondary">{link.phrase}</span>
                    <span className="min-w-0 truncate font-normal text-tertiary">{link.title}</span>
                  </LinkChip>
                </li>
              ))}
            </ul>
          ) : (
            EMPTY
          )}
        </Field>
        <Field label="子任务" count={node.children.length} stack={node.children.length > 0}>
          {node.children.length ? <ChildList node={node} /> : EMPTY}
        </Field>
      </dl>

      {notes && (
        <Section title="备注">
          <p className="text-sm whitespace-pre-wrap text-secondary">{notes}</p>
        </Section>
      )}

      <Section
        title="工具步骤"
        count={calls}
        aside={
          <Button
            size="xs"
            color="secondary"
            iconLeading={Download01}
            disabled={!detail?.steps.length && !node.live.length}
            onClick={() => exportTask(node.id)}
          >
            导出此任务轨迹
          </Button>
        }
      >
        <ToolTerminal
          title={`${node.agents[0] ?? "agent"} — ${node.id}`}
          steps={detail?.steps ?? []}
          live={node.live}
          state={state}
          reducedMotion={reducedMotion}
          onRetry={() => void retryNode(node.id)}
        />
      </Section>
    </>
  );
}

/** A chip that selects another task; hovering it highlights that task on the map. */
function LinkChip({ id, children }: { id: string; children: ReactNode }) {
  const select = useStudy((state) => state.select);
  const hover = useStudy((state) => state.hover);
  const unhover = useStudy((state) => state.unhover);
  return (
    <button
      type="button"
      onClick={() => select(id)}
      onPointerEnter={() => hover(id)}
      onPointerLeave={() => unhover(id)}
      onFocus={() => hover(id)}
      onBlur={() => unhover(id)}
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-medium shadow-xs ring-1 ring-border-secondary outline-none ring-inset transition hover:bg-primary_hover hover:ring-border-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      {children}
    </button>
  );
}

function ChildList({ node }: { node: ViewNode }) {
  const view = useStudy((state) => state.view);
  const select = useStudy((state) => state.select);
  const hover = useStudy((state) => state.hover);
  const unhover = useStudy((state) => state.unhover);
  return (
    <ul className="-mx-2 flex flex-col">
      {node.children.map((child) => {
        const match = findNode(view, child.id);
        const tone = match ? nodeTone(view, match) : "todo";
        return (
          <li key={child.id}>
            <button
              type="button"
              onClick={() => select(child.id)}
              onPointerEnter={() => hover(child.id)}
              onPointerLeave={() => unhover(child.id)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              <StatusIcon tone={tone} pulse={tone === "progress"} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-secondary group-hover:text-primary">{child.title || "未命名任务"}</span>
              <span className="font-mono text-xs text-quaternary uppercase">{child.id}</span>
              <ChevronRight aria-hidden="true" className="size-4 text-quaternary opacity-0 transition group-hover:opacity-100" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Goal

function GoalBody() {
  const view = useStudy((state) => state.view);
  const setTab = useStudy((state) => state.setTab);
  const goal = view?.nodes.find((node) => node.goal) ?? null;
  const { resolved, total } = progress(view);
  const segments = useMemo(() => progressSegments(view), [view]);
  const roster = useMemo(() => agentRoster(view), [view]);
  const activity = goalActivity(view);
  const percent = total ? Math.round((resolved / total) * 100) : 0;
  const hasReport = Boolean(view?.report);
  const reducedMotion = useStudy((state) => state.reducedMotion);
  const question = (view?.goal?.title || goal?.title || "").trim();
  const errors = view ? view.nodes.filter((node) => !node.goal && node.status !== "resolved" && isErroneous(view, node.id)).length : 0;

  return (
    <>
      <p className="text-md whitespace-pre-wrap text-primary">{question}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge color={activity ? "brand" : view?.running ? "progress" : "done"} dot>
          <span className={cx(activity && !reducedMotion && "prism-shimmer")}>{phaseLabel(view)}</span>
        </Badge>
        {view?.updated_at && (
          <span className="text-xs text-quaternary">
            更新于 <span className="font-mono tabular">{formatTime(view.updated_at)}</span>
          </span>
        )}
      </div>

      <Section title="进度">
        <div className="flex items-baseline gap-2">
          <span className="text-display-xs font-semibold text-primary tabular">
            {resolved}
            <span className="text-quaternary">/{total}</span>
          </span>
          <span className="text-sm text-tertiary">项任务已完成</span>
          <span className="ml-auto font-mono text-sm text-secondary tabular">{percent}%</span>
        </div>
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-tertiary" role="img" aria-label={segments.map((s) => `${TONE_LABEL[s.tone]} ${s.count}`).join("，")}>
          {segments.map((segment, index) => (
            <motion.span
              key={segment.tone}
              className={cx("h-full first:rounded-l-full last:rounded-r-full", TONE_CLASS[segment.tone].dot)}
              initial={{ flexGrow: 0.0001 }}
              animate={{ flexGrow: segment.count }}
              transition={{ duration: 0.7, delay: 0.1 + index * 0.06, ease: EASE_OUT }}
              style={{ flexBasis: 0 }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((segment) => (
            <li key={segment.tone} className="inline-flex items-center gap-1.5 text-xs text-tertiary">
              <span aria-hidden="true" className={cx("size-2 rounded-full", TONE_CLASS[segment.tone].dot)} />
              {TONE_LABEL[segment.tone]}
              <span className="font-medium text-secondary tabular">{segment.count}</span>
            </li>
          ))}
        </ul>
        {errors > 0 && <p className="mt-2 text-xs text-error-primary">{errors} 项任务被核验指出错误，待修正。</p>}
      </Section>

      <Section title="研究智能体" count={roster.length}>
        {roster.length ? (
          <ul className="flex flex-col">
            {roster.map((entry) => (
              <li key={entry.agent} className="flex items-center gap-3 border-b border-secondary py-2.5 last:border-b-0">
                <AgentAvatar name={entry.agent} tone={entry.tone} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{entry.agent}</span>
                {entry.active > 0 && (
                  <Tooltip label={`${entry.active} 项进行中`}>
                    <span tabIndex={0} className="inline-flex items-center gap-1 text-xs text-tertiary tabular outline-none">
                      <StatusIcon tone="progress" className="size-3.5" pulse />
                      {entry.active}
                    </span>
                  </Tooltip>
                )}
                <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-tertiary" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-status-done" style={{ width: `${(entry.resolved / Math.max(1, entry.tasks)) * 100}%` }} />
                </span>
                <span className="w-14 text-right text-xs text-tertiary tabular">
                  <span className="font-medium text-secondary">{entry.resolved}</span>/{entry.tasks} 项
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-quaternary">{view?.running ? "正在分配任务" : "—"}</p>
        )}
      </Section>

      {goal && goal.children.length > 0 && (
        <Section title="一级任务" count={goal.children.length}>
          <ChildList node={goal} />
        </Section>
      )}

      <div className="mt-8">
        <Tooltip label="报告生成后可以阅读" className={cx("w-full", hasReport && "[&>[role=tooltip]]:hidden")}>
          <Button color="primary" size="md" iconLeading={BookOpen01} disabled={!hasReport} onClick={() => setTab("report")} className="w-full">
            阅读研究报告
          </Button>
        </Tooltip>
      </div>
    </>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
