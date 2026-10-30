// The two kinds of node on the star map, in CoForge's vocabulary: a task is an agent avatar tile (rounded
// square, agent tone, initials, gradient hairline frame) with a presence-dot status; the goal is a
// compact card. Both are real buttons positioned in screen space.

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { agentTone } from "../../lib/palette";
import { TONE_CLASS, type TaskTone } from "../../lib/status";
import type { ViewNode } from "../../types/api";
import { AgentFace } from "../../ui/AgentAvatar";
import { agentMood } from "../../lib/mood";
import { cx } from "../../ui/cx";
import { estimateGoalCard } from "./labels";
import { PrismMark } from "./PrismMark";

export interface NodeHandlers {
  onToggle(id: string): void;
  onSelect(id: string): void;
  onHover(id: string): void;
  onUnhover(id: string): void;
  onFocus(id: string, visible: boolean): void;
  onBlur(id: string): void;
}

interface CommonProps extends NodeHandlers {
  node: ViewNode;
  x: number;
  y: number;
  selected: boolean;
  hot: boolean;
  dim: boolean;
  roving: boolean;
  label: string;
  delay: number;
}

function handlersOf(props: CommonProps) {
  const { node } = props;
  return {
    onClick: () => props.onToggle(node.id),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        props.onSelect(node.id);
      }
    },
    onPointerEnter: (event: PointerEvent) => event.pointerType !== "touch" && props.onHover(node.id),
    onPointerLeave: (event: PointerEvent) => event.pointerType !== "touch" && props.onUnhover(node.id),
    onFocus: (event: { currentTarget: HTMLElement }) => props.onFocus(node.id, event.currentTarget.matches(":focus-visible")),
    onBlur: () => props.onBlur(node.id),
  };
}

export function NodeTile(props: CommonProps & { r: number; tone: TaskTone; running: boolean }) {
  const { node, x, y, r, tone, selected, hot, dim, roving, label, delay, running } = props;
  const size = r * 2;
  const radius = size / 4;
  const unassigned = node.agents.length === 0;
  const inProgress = running && node.status === "in_progress";
  const dot = Math.max(8, Math.round(size / 4) + 1);
  const ringRadius = (gap: number) => radius + gap;
  return (
    <div
      className="absolute top-0 left-0"
      style={{
        transform: `translate(${(x - r).toFixed(1)}px, ${(y - r).toFixed(1)}px)`,
        width: size,
        height: size,
        opacity: dim ? 0.3 : 1,
        transition: "opacity .25s var(--ease-out-quint)",
        zIndex: hot || selected ? 8 : 5,
      }}
    >
      <div className="sm-in size-full" style={{ "--sm-delay": `${delay}s` } as CSSProperties}>
        <button
          type="button"
          data-star={node.id}
          data-selected={selected || undefined}
          data-hot={hot || undefined}
          aria-label={label}
          aria-pressed={selected}
          tabIndex={roving ? 0 : -1}
          {...handlersOf(props)}
          className={cx(
            "sm-node relative flex size-full cursor-pointer items-center justify-center font-semibold select-none",
            unassigned ? "border border-dashed border-primary bg-primary text-quaternary" : "prism-avatar text-white",
            node.status === "cancelled" && "opacity-50 saturate-50",
          )}
          style={{ borderRadius: radius, fontSize: Math.round(size * 0.36), backgroundColor: unassigned ? undefined : agentTone(node.tone) }}
        >
          {unassigned ? (
            <span aria-hidden="true">?</span>
          ) : (
            <AgentFace mood={agentMood(node, tone === "error")} />
          )}
        </button>
        <span aria-hidden="true" className="sm-sel" style={{ borderRadius: ringRadius(6) }} />
        {inProgress && <span aria-hidden="true" className="sm-beam prism-beam" style={{ borderRadius: ringRadius(3) }} />}
        {tone === "error" && <span aria-hidden="true" className="sm-err" style={{ borderRadius: ringRadius(3) }} />}
        <span
          aria-hidden="true"
          className={cx("sm-dot pointer-events-none absolute rounded-full", TONE_CLASS[tone].dot)}
          style={{ width: dot, height: dot, right: -2, bottom: -2, boxShadow: "0 0 0 2px var(--color-bg-primary)" }}
        />
      </div>
    </div>
  );
}

export function GoalCard(
  props: CommonProps & { width: number; title: string; resolved: number; total: number; running: boolean; tier: 0 | 1 | 2 | 3 },
) {
  const { x, y, title, resolved, total, running, selected, hot, dim, roving, label, delay, tier: resting } = props;
  // A pill grows back into the full card while it is hovered or focused.
  const tier = hot && resting === 3 ? 1 : resting;
  const width = tier === resting ? props.width : estimateGoalCard("", tier).w;
  return (
    <div
      className="absolute top-0 left-0"
      style={{
        transform: `translate(${(x - width / 2).toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`,
        width,
        opacity: dim ? 0.3 : 1,
        transition: "opacity .25s var(--ease-out-quint)",
        zIndex: hot || selected ? 9 : 6,
      }}
    >
      <div className="sm-in relative" style={{ "--sm-delay": `${delay}s` } as CSSProperties}>
        <button
          type="button"
          data-star={props.node.id}
          data-goal
          data-selected={selected || undefined}
          data-hot={hot || undefined}
          aria-label={label}
          aria-pressed={selected}
          tabIndex={roving ? 0 : -1}
          {...handlersOf(props)}
          className={cx("sm-node sm-goal relative block w-full cursor-pointer rounded-xl bg-primary text-left", tier === 3 ? "px-3 py-2" : tier === 2 ? "px-3 py-2.5" : "px-4 py-3")}
        >
          {tier === 3 ? (
            <span className="flex items-center gap-1.5">
              <PrismMark active={running} className="size-4" />
              <span className="text-xs font-semibold text-brand-secondary">研究问题</span>
            </span>
          ) : tier === 2 ? (
            <span className="flex items-center gap-1.5">
              <PrismMark active={running} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{title}</span>
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <PrismMark active={running} className="size-4" />
                <span className="text-xs font-semibold text-brand-secondary">研究问题</span>
                {total > 0 && <span className="ml-auto text-xs text-tertiary tabular">{resolved}/{total}</span>}
              </span>
              <span className={cx("mt-1.5 block text-sm font-semibold text-primary", tier === 0 ? "line-clamp-2" : "truncate")}>{title}</span>
            </>
          )}
          <span className={cx("block h-1 overflow-hidden rounded-full bg-tertiary", tier === 3 ? "mt-1.5 h-0.5" : tier === 2 ? "mt-2" : "mt-2.5")} aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-solid transition-[width] duration-700 ease-[var(--ease-out-quint)]" style={{ width: `${total ? (resolved / total) * 100 : 0}%` }} />
          </span>
        </button>
        <span aria-hidden="true" className="sm-sel" style={{ borderRadius: 16 }} />
      </div>
    </div>
  );
}
