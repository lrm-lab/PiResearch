// The hover card: a CoForge-style floating card near a task's tile, shown after a short dwell on hover
// or keyboard focus. It is a read-only summary; clicking the node still opens the detail panel.

import { useEffect, useState } from "react";
import { stateText, toolCount } from "../../lib/activity";
import { drawnRelation } from "../../lib/edges";
import { RELATION_HEX } from "../../lib/palette";
import type { TaskTone } from "../../lib/status";
import type { Snapshot, ViewNode } from "../../types/api";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { Badge } from "../../ui/Badge";
import type { DrawnRelation } from "../model";

export const POPOVER_W = 280;
const VERIFY_LABEL: Record<Exclude<DrawnRelation, "parent">, string> = { audit: "审核", support: "支持", challenge: "挑战", error: "错误" };

/** True once `id` has held the hover / focus for `ms`; false immediately when it lets go. */
export function useDwell(id: string | null, ms = 250, hold = false): string | null {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!id || hold) {
      setReady(null);
      return;
    }
    const timer = window.setTimeout(() => setReady(id), ms);
    return () => window.clearTimeout(timer);
  }, [id, ms, hold]);
  return id && ready === id ? id : null;
}

function relationsOf(view: Snapshot, node: ViewNode, byId: Map<string, ViewNode>) {
  const parentEdge = view.edges.find((e) => e.relation === "parent" && e.to === node.id);
  const parent = parentEdge ? byId.get(parentEdge.from) : undefined;
  const counts = new Map<Exclude<DrawnRelation, "parent">, number>();
  for (const edge of view.edges) {
    if (edge.relation === "parent" || (edge.from !== node.id && edge.to !== node.id)) continue;
    const rel = drawnRelation(edge.relation) as Exclude<DrawnRelation, "parent">;
    counts.set(rel, (counts.get(rel) ?? 0) + 1);
  }
  return { parent, children: node.children.length, verification: [...counts.entries()] };
}

export function NodePopover({
  view,
  node,
  tone,
  x,
  y,
  r,
  bounds,
  below,
  latest,
  byId,
  roster,
}: {
  view: Snapshot;
  node: ViewNode;
  tone: TaskTone;
  x: number;
  y: number;
  r: number;
  /** The free area of the map (screen px). */
  bounds: { w: number; h: number };
  below: boolean;
  latest: string | null;
  byId: Map<string, ViewNode>;
  roster: Map<string, ViewNode["tone"]>;
}) {
  const rel = relationsOf(view, node, byId);
  const calls = toolCount(node);
  const left = Math.min(Math.max(x - POPOVER_W / 2, 12), Math.max(12, bounds.w - POPOVER_W - 12));
  const gap = r + 12;
  const style = below ? { left, top: y + gap } : { left, top: y - gap, transform: "translateY(-100%)" };
  return (
    <div
      data-ui
      role="presentation"
      aria-hidden="true"
      className="sm-pop pointer-events-none absolute z-30 rounded-xl border border-secondary bg-primary p-3.5 shadow-lg"
      style={{ ...style, width: POPOVER_W }}
    >
      <p className="line-clamp-2 text-sm font-semibold text-primary">{node.title || "未命名任务"}</p>
      <div className="mt-2 flex items-center gap-2">
        <Badge color={tone} dot>
          {stateText(view, node)}
        </Badge>
        <span className="font-mono text-xs text-quaternary">{node.id.toUpperCase()}</span>
        <span className="ml-auto text-xs text-tertiary tabular">{calls > 0 ? `${calls} 次调用` : "尚无调用"}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {node.agents.length > 0 ? (
          <>
            <span className="flex -space-x-1">
              {node.agents.slice(0, 4).map((agent) => (
                <AgentAvatar key={agent} name={agent} tone={roster.get(agent) ?? node.tone} size="xs" ring />
              ))}
            </span>
            <span className="min-w-0 truncate text-xs font-medium text-secondary">{node.agents.join("、")}</span>
          </>
        ) : (
          <span className="text-xs text-tertiary">还没有智能体接手</span>
        )}
      </div>
      {latest && <p className="mt-3 truncate rounded-lg bg-secondary px-2.5 py-1.5 font-mono text-xs text-tertiary">{latest}</p>}
      {(rel.parent || rel.children > 0 || rel.verification.length > 0) && (
        <ul className="mt-3 space-y-1 border-t border-secondary pt-2.5 text-xs text-tertiary">
          {rel.parent && (
            <li className="truncate">
              上级 · <span className="text-secondary">{rel.parent.goal ? "研究问题" : `${rel.parent.id.toUpperCase()} ${rel.parent.title}`}</span>
            </li>
          )}
          {rel.children > 0 && <li>{rel.children} 个子任务</li>}
          {rel.verification.length > 0 && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {rel.verification.map(([name, count]) => (
                <span key={name} className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: RELATION_HEX[name] }} />
                  {VERIFY_LABEL[name]} {count}
                </span>
              ))}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
