// The 44px toolbar under the header (map and list): agent filter chips, status counters, and the
// relation legend popover.

import { InfoCircle } from "@untitledui/icons";
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { StatusIcon } from "../ui/StatusIcon";
import { agentRoster, COUNTER_TONES, RELATION_LEGEND, RELATION_ORDER, TONE_LABEL, toneCounts, visibleTasks } from "./model";
import { Popover, Skeleton, Tooltip } from "./primitives";
import { RelationGlyph } from "./relations";
import { useStudy } from "./store";
import { useStudyUi } from "./ui";

export function Toolbar() {
  const view = useStudy((state) => state.view);
  const hidden = useStudy((state) => state.hiddenAgents);
  const toggleAgent = useStudy((state) => state.toggleAgent);
  const showAllAgents = useStudy((state) => state.showAllAgents);
  const roster = useMemo(() => agentRoster(view), [view]);
  const counts = useMemo(() => toneCounts(view, visibleTasks(view, hidden)), [view, hidden]);
  const noneHidden = Object.keys(hidden).length === 0;

  if (!view) {
    return (
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-secondary bg-primary px-4 sm:px-6" aria-hidden="true">
        {[56, 88, 96, 80, 72].map((width, index) => (
          <Skeleton key={index} className="h-7 rounded-lg" style={{ width }} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-11 shrink-0 items-center gap-3 border-b border-secondary bg-primary pl-4 sm:pl-6 pr-2 sm:pr-4">
      <div
        role="group"
        aria-label="按智能体筛选"
        className="-my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]"
      >
        <FilterChip pressed={noneHidden} onClick={showAllAgents} label="全部">
          全部
        </FilterChip>
        {roster.map((entry) => {
          const shown = !hidden[entry.agent];
          return (
            <FilterChip
              key={entry.agent}
              pressed={shown && !noneHidden}
              dimmed={!shown}
              onClick={() => toggleAgent(entry.agent)}
              label={`${shown ? "隐藏" : "显示"} ${entry.agent} 的任务`}
            >
              <AgentAvatar name={entry.agent} tone={entry.tone} size="xxs" className={cx("transition", !shown && "grayscale opacity-50")} />
              <span className={cx(!shown && "line-through decoration-1")}>{entry.agent}</span>
              <span className="text-quaternary tabular">{entry.tasks}</span>
            </FilterChip>
          );
        })}
      </div>

      <div className="hidden shrink-0 items-center gap-3.5 md:flex" aria-label="任务状态统计">
        {COUNTER_TONES.map((tone) => (
          <Tooltip key={tone} label={TONE_LABEL[tone]}>
            <span
              tabIndex={0}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-secondary tabular outline-none focus-visible:outline-2 focus-visible:outline-focus-ring",
                counts[tone] === 0 && "opacity-45",
              )}
              aria-label={`${TONE_LABEL[tone]} ${counts[tone]}`}
            >
              <StatusIcon tone={tone} pulse={tone === "progress" && counts[tone] > 0} />
              <motion.span key={counts[tone]} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                {counts[tone]}
              </motion.span>
            </span>
          </Tooltip>
        ))}
      </div>

      <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-[var(--color-border-secondary)] md:block" />
      <RelationLegend />
    </div>
  );
}

function FilterChip({
  pressed,
  dimmed = false,
  onClick,
  label,
  children,
}: {
  pressed: boolean;
  dimmed?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap outline-none transition duration-100 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
        pressed
          ? "bg-brand-primary text-brand-secondary ring-1 ring-brand-200 ring-inset dark:ring-brand-800"
          : dimmed
            ? "text-quaternary hover:bg-primary_hover hover:text-tertiary"
            : "text-secondary ring-1 ring-border-secondary ring-inset hover:bg-primary_hover hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function RelationLegend() {
  const open = useStudyUi((state) => state.popover === "legend");
  const toggle = useStudyUi((state) => state.togglePopover);
  const setPopover = useStudyUi((state) => state.setPopover);
  return (
    <Popover
      open={open}
      onClose={() => setPopover(null)}
      label="图例"
      className="w-[min(20rem,calc(100vw-2rem))] p-1.5"
      trigger={
        <Button
          color="tertiary"
          size="sm"
          iconLeading={InfoCircle}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => toggle("legend")}
          className={cx(open && "bg-primary_hover text-secondary")}
        >
          <span className="max-sm:sr-only">图例</span>
        </Button>
      }
    >
      <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-tertiary">关系</p>
      <ul>
        {RELATION_ORDER.map((relation) => (
          <li key={relation} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
            <RelationGlyph relation={relation} />
            <span className="text-sm font-medium text-primary">{RELATION_LEGEND[relation].label}</span>
            <span className="ml-auto text-xs text-tertiary">{RELATION_LEGEND[relation].hint}</span>
          </li>
        ))}
      </ul>
      <div className="mx-2.5 my-1.5 h-px bg-[var(--color-border-secondary)]" />
      <p className="px-2.5 pt-1 pb-1 text-xs font-semibold text-tertiary">任务状态</p>
      <ul className="grid grid-cols-2 pb-1">
        {(["todo", "progress", "done", "closed", "error"] as const).map((tone) => (
          <li key={tone} className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-secondary">
            <StatusIcon tone={tone} />
            {TONE_LABEL[tone]}
          </li>
        ))}
      </ul>
    </Popover>
  );
}
