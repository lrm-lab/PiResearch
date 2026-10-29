// 任务 tab: CoForge Activity-style full-width rows grouped by status under sticky headers. Rows
// stagger in once on mount (never on polls); arrow keys / J K move the selection (page shortcuts).

import { FilterLines } from "@untitledui/icons";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef } from "react";
import { goalActivity, isErroneous, toolCount } from "../lib/activity";
import { taskTone } from "../lib/status";
import type { Edge, ViewNode } from "../types/api";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { StatusIcon } from "../ui/StatusIcon";
import { groupTasks, relationCounts, relationName, visibleTasks, type StatusGroup } from "./model";
import { EASE_OUT, EmptyState, Skeleton, Tooltip } from "./primitives";
import { RelationDot } from "./relations";
import { useStudy } from "./store";

const GROUP_TONE = { in_progress: "progress", open: "todo", resolved: "done", cancelled: "closed" } as const;

export function TaskList({ narrow }: { narrow: boolean }) {
  const view = useStudy((state) => state.view);
  const hidden = useStudy((state) => state.hiddenAgents);
  const selectedId = useStudy((state) => state.selectedId);
  const showAllAgents = useStudy((state) => state.showAllAgents);
  const reducedMotion = useStudy((state) => state.reducedMotion);
  const tasks = useMemo(() => visibleTasks(view, hidden), [view, hidden]);
  const groups = useMemo(() => groupTasks(tasks), [tasks]);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only the first paint staggers; later polls and filter changes appear in place.
  const mounted = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => (mounted.current = true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep the selected row in view (keyboard navigation, selection from the map or the panel).
  useEffect(() => {
    if (!selectedId) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [selectedId, reducedMotion]);

  const total = view ? view.nodes.filter((node) => !node.goal).length : 0;

  return (
    <div
      className={cx(
        "flex min-h-0 flex-col bg-primary transition-[width] duration-300 ease-out",
        narrow ? "w-[min(35rem,50%)] shrink-0" : "w-full",
      )}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="list" aria-label="任务">
        {!view && <ListSkeleton />}
        {view && total === 0 && (
          <div className="flex h-full items-center justify-center py-16">
            <EmptyState
              icon={FilterLines}
              role="status"
              title={goalActivity(view)?.phase === "planning" ? <span className="prism-shimmer">正在拆解研究问题</span> : "还没有任务"}
              description="任务会在研究智能体拆解问题后出现在这里。"
            />
          </div>
        )}
        {view && total > 0 && tasks.length === 0 && (
          <div className="flex h-full items-center justify-center py-16">
            <EmptyState icon={FilterLines} role="status" title="没有符合筛选的任务" description="所有任务的智能体都被隐藏了。">
              <Button onClick={showAllAgents}>显示全部智能体</Button>
            </EmptyState>
          </div>
        )}
        {view &&
          groups.map((group, groupIndex) => (
            <Group
              key={group.status}
              group={group}
              edges={view.edges}
              selectedId={selectedId}
              running={view.running !== false}
              stagger={!mounted.current && !reducedMotion}
              offset={groups.slice(0, groupIndex).reduce((sum, entry) => sum + entry.items.length + 1, 0)}
              erroneous={(id) => isErroneous(view, id)}
              compact={narrow}
            />
          ))}
        {view && tasks.length > 0 && <div className="h-16" aria-hidden="true" />}
      </div>
    </div>
  );
}

function Group({
  group,
  edges,
  selectedId,
  running,
  stagger,
  offset,
  erroneous,
  compact,
}: {
  group: StatusGroup;
  edges: readonly Edge[];
  selectedId: string | null;
  running: boolean;
  stagger: boolean;
  offset: number;
  erroneous: (id: string) => boolean;
  compact: boolean;
}) {
  return (
    <section role="presentation">
      <h2 className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-secondary bg-primary/90 px-4 text-sm font-semibold text-secondary backdrop-blur-md sm:px-6">
        <StatusIcon tone={GROUP_TONE[group.status]} className="size-3.5" />
        {group.label}
        <span className="font-medium text-quaternary tabular">{group.items.length}</span>
      </h2>
      <ul role="presentation">
        {group.items.map((node, index) => (
          <Row
            key={node.id}
            node={node}
            edges={edges}
            selected={node.id === selectedId}
            erroneous={erroneous(node.id)}
            running={running}
            delay={stagger ? Math.min(offset + index, 14) * 0.028 : -1}
            compact={compact}
          />
        ))}
      </ul>
    </section>
  );
}

const Row = memo(function Row({
  node,
  edges,
  selected,
  erroneous,
  running,
  delay,
  compact,
}: {
  node: ViewNode;
  edges: readonly Edge[];
  selected: boolean;
  erroneous: boolean;
  running: boolean;
  delay: number;
  compact: boolean;
}) {
  const select = useStudy((state) => state.select);
  const hover = useStudy((state) => state.hover);
  const unhover = useStudy((state) => state.unhover);
  const tone = taskTone(node.status, erroneous);
  const calls = toolCount(node);
  const relations = relationCounts(edges, node.id);
  const liveCall = running ? node.live[node.live.length - 1] : undefined;

  return (
    <motion.li
      role="listitem"
      initial={delay >= 0 ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.max(0, delay), ease: EASE_OUT }}
    >
      <button
        type="button"
        data-row={node.id}
        aria-current={selected || undefined}
        onClick={() => select(selected ? null : node.id)}
        onPointerEnter={() => hover(node.id)}
        onPointerLeave={() => unhover(node.id)}
        className={cx(
          "group relative flex w-full items-center gap-3 border-b border-secondary px-4 py-3 text-left outline-none transition-colors duration-100 sm:gap-4 sm:px-6",
          "focus-visible:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
          selected ? "bg-active" : "hover:bg-primary_hover",
        )}
      >
        {selected && <motion.span layoutId="row-selection" className="absolute inset-y-0 left-0 w-0.5 bg-brand-solid" transition={{ type: "spring", stiffness: 600, damping: 45 }} />}
        <StatusIcon tone={tone} pulse={tone === "progress"} className="self-start mt-1" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cx("truncate text-md font-semibold", node.status === "cancelled" ? "text-tertiary line-through decoration-1" : "text-primary")}>
              {node.title || "未命名任务"}
            </span>
            <span className="hidden shrink-0 font-mono text-xs text-quaternary uppercase sm:inline">{node.id}</span>
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-x-3 gap-y-1 text-sm text-tertiary">
            {node.agents.length ? (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <AgentAvatar name={node.agents[0]!} tone={node.tone} size="xxs" />
                <span className="text-secondary">{node.agents[0]}</span>
                {node.agents.length > 1 && <span className="text-quaternary">+{node.agents.length - 1}</span>}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-quaternary">
                <span aria-hidden="true" className="size-5 rounded-full border border-dashed border-primary" />
                {running ? "待分配" : "未分配"}
              </span>
            )}
            {relations.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                {relations.map(({ relation, count }) => (
                  <Tooltip key={relation} label={`${relationName(relation)} ${count}`}>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-secondary px-1.5 text-xs font-medium text-secondary tabular ring-1 ring-border-secondary ring-inset">
                      <RelationDot relation={relation} />
                      {count > 1 ? count : relationName(relation)}
                      {count > 1 && <span className="sr-only">{relationName(relation)}</span>}
                    </span>
                  </Tooltip>
                ))}
              </span>
            )}
            {liveCall && !compact && (
              <span className="hidden min-w-0 items-center gap-1.5 font-mono text-xs md:inline-flex">
                <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-progress" />
                <span className={cx("truncate", liveCall.tool === "思考" ? "prism-shimmer text-quaternary" : "text-tertiary")}>
                  {liveCall.tool === "思考" ? liveCall.hint || "正在想下一步" : liveCall.label}
                </span>
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 self-start pt-1 font-mono text-xs text-tertiary tabular">
          {calls ? (
            <>
              {calls}
              <span className="text-quaternary"> 次调用</span>
            </>
          ) : (
            <span className="text-quaternary">—</span>
          )}
        </span>
      </button>
    </motion.li>
  );
});

function ListSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex h-9 items-center gap-2 border-b border-secondary px-4 sm:px-6">
        <Skeleton className="h-3.5 w-20" />
      </div>
      {[0.62, 0.48, 0.7, 0.55, 0.4, 0.66, 0.5].map((width, index) => (
        <div key={index} className="flex items-start gap-4 border-b border-secondary px-4 py-3.5 sm:px-6">
          <Skeleton className="mt-0.5 size-4 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4" style={{ width: `${width * 100}%` }} />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}
