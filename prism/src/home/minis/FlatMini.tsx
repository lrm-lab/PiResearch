// No-WebGL mini: the same thumbnail drawn flat in SVG (rounded chips in status colours, thin
// relation lines, a small prism glyph at the goal) on a dotted desk. Token colours only.

import { memo } from "react";
import type { Relation, Thumbnail } from "../../types/api";
import { taskTone, type TaskTone } from "../../lib/status";
import { thumbFrame } from "../format";

const FILL: Record<TaskTone, string> = {
  todo: "fill-status-todo/45",
  progress: "fill-status-progress",
  review: "fill-status-review",
  done: "fill-status-done",
  closed: "fill-status-closed",
  error: "fill-status-error",
};

const STROKE: Record<Relation, string> = {
  parent: "stroke-border-primary",
  audit: "stroke-status-review",
  fusion: "stroke-status-review",
  support: "stroke-status-done",
  challenge: "stroke-status-todo",
  error: "stroke-status-error",
};

export const FlatMini = memo(function FlatMini({ thumb }: { thumb: Thumbnail | undefined }) {
  const nodes = thumb?.ok ? thumb.nodes : [];
  const frame = thumbFrame(nodes);
  const [x, y, w, h] = frame.viewBox;
  const byId = new Map(nodes.map((node, index) => [node.id, { node, r: frame.radii[index]! }]));
  const erroneous = new Set((thumb?.edges ?? []).filter((edge) => edge.relation === "error").map((edge) => edge.to));
  // Fit the square layout box into the wide card: widen the viewBox to the card's 16:10.
  const width = Math.max(w, h * 1.6);
  const height = width / 1.6;
  const viewBox = `${x + w / 2 - width / 2} ${y + h / 2 - height / 2} ${width} ${height}`;
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[radial-gradient(var(--color-border-secondary)_1.2px,transparent_1.2px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_85%)]"
    >
      {nodes.length === 0 && (
        <svg viewBox="0 0 160 100" className="size-full" preserveAspectRatio="xMidYMid meet">
          <path d="M80 34 L94 62 L66 62 Z" className="fill-brand-200 stroke-brand-500" strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
      )}
      {nodes.length > 0 && (
        <svg viewBox={viewBox} className="size-full" preserveAspectRatio="xMidYMid meet">
          {(thumb?.edges ?? []).map((edge, index) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={index}
                x1={from.node.x}
                y1={from.node.y}
                x2={to.node.x}
                y2={to.node.y}
                className={STROKE[edge.relation]}
                strokeWidth={frame.weight * 1.1}
                strokeLinecap="round"
              />
            );
          })}
          {nodes.map((node, index) => {
            const r = frame.radii[index]!;
            if (node.goal) {
              const s = r * 1.1;
              return (
                <path
                  key={node.id}
                  d={`M ${node.x} ${node.y - s} L ${node.x + s * 0.9} ${node.y + s * 0.6} L ${node.x - s * 0.9} ${node.y + s * 0.6} Z`}
                  className="fill-brand-200 stroke-brand-500"
                  strokeWidth={frame.weight * 1.2}
                  strokeLinejoin="round"
                />
              );
            }
            const tone = taskTone(node.status, erroneous.has(node.id));
            return (
              <rect
                key={node.id}
                x={node.x - r * 0.85}
                y={node.y - r * 0.56}
                width={r * 1.7}
                height={r * 1.12}
                rx={r * 0.22}
                className={FILL[tone]}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
});
