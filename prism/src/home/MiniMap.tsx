// The card's picture: a flat SVG star map of the study's /thumbnail (geometry only, no titles).
// Nodes are small rounded tiles in the agent tone with a status presence dot, the goal a violet
// tile in the avatar's gradient hairline, parent edges 1px hairlines, all on a quiet dotted ground
// with a faint violet glow behind the goal. No WebGL: it scales with the card.

import { memo, useId } from "react";
import { agentTone, BRAND, LAVENDER, STATUS_HEX } from "../lib/palette";
import { TONE_HEX, taskTone } from "../lib/status";
import type { Thumbnail, ThumbnailNode } from "../types/api";
import { cx } from "../ui/cx";

const W = 320;
const H = 176;
const PAD_X = 40;
const PAD_Y = 28;

interface Placed {
  node: ThumbnailNode;
  x: number;
  y: number;
  size: number;
}

/** Fit node centres into the W×H box (aspect kept), tile sizes from the layout radius. */
export function placeNodes(nodes: readonly ThumbnailNode[]): Placed[] {
  if (!nodes.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const k = Math.min((W - PAD_X * 2) / bw, (H - PAD_Y * 2) / bh);
  const cx0 = (minX + maxX) / 2;
  const cy0 = (minY + maxY) / 2;
  const maxR = Math.max(...nodes.map((n) => n.radius || 0), 1);
  return nodes.map((node) => {
    const rel = (node.radius || 0) / maxR;
    const size = node.goal ? 20 : 7 + rel * 5;
    return { node, x: W / 2 + (node.x - cx0) * k, y: H / 2 + (node.y - cy0) * k, size };
  });
}

export const MiniMap = memo(function MiniMap({
  thumb,
  running,
  noGraph,
}: {
  thumb: Thumbnail | undefined;
  running: boolean;
  noGraph: boolean;
}) {
  const id = useId();
  const ok = !!thumb?.ok && !!thumb.nodes?.length;
  const placed = ok ? placeNodes(thumb!.nodes) : [];
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const goal = placed.find((p) => p.node.goal) ?? placed[0];
  const gx = goal ? (goal.x / W) * 100 : 50;
  const gy = goal ? (goal.y / H) * 100 : 50;
  const waiting = !ok && !noGraph;
  const caption = !ok ? (noGraph ? "没有任务图" : thumb && running ? "正在等待派发任务" : null) : null;

  return (
    <div className="relative aspect-[320/176] overflow-hidden bg-secondary" aria-hidden="true">
      <div className="home-map-grid absolute inset-0" />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(46% 62% at ${gx}% ${gy}%, color-mix(in srgb, var(--color-brand-600) 11%, transparent), transparent 100%)`,
        }}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="presentation">
        <defs>
          <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={LAVENDER} />
            <stop offset="1" stopColor={BRAND[600]} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {ok && (
          <g>
            {thumb!.edges
              .filter((e) => e.relation === "parent")
              .map((e) => {
                const a = byId.get(e.from);
                const b = byId.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${e.from}>${e.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    className="home-map-edge"
                  />
                );
              })}
            {placed
              .filter((p) => !p.node.goal)
              .map((p, i) => (
                <Tile key={p.node.id} p={p} index={i} frame={`${id}-frame`} />
              ))}
            {goal && <Tile p={goal} index={0} frame={`${id}-frame`} goal />}
          </g>
        )}
        {!ok && (
          <g transform={`translate(${W / 2} ${H / 2 - (caption ? 8 : 0)})`}>
            <rect
              x="-11"
              y="-11"
              width="22"
              height="22"
              rx="6"
              fill={noGraph ? "none" : BRAND[600]}
              className={cx(waiting || running ? "home-goal-pulse" : undefined, noGraph && "home-map-edge")}
              strokeWidth={noGraph ? 1 : 0}
              strokeDasharray={noGraph ? "3 3" : undefined}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            {!noGraph && <rect x="-10.25" y="-10.25" width="20.5" height="20.5" rx="5.5" fill="none" stroke={`url(#${id}-frame)`} strokeWidth="1.5" />}
          </g>
        )}
      </svg>
      {caption && (
        <p className="absolute inset-x-0 bottom-4 text-center text-xs text-tertiary">
          {running ? <span className="prism-shimmer">{caption}</span> : caption}
        </p>
      )}
    </div>
  );
});

function Tile({ p, index, frame, goal = false }: { p: Placed; index: number; frame: string; goal?: boolean }) {
  const { node, size } = p;
  const half = size / 2;
  const tone = taskTone(node.status);
  const dot = TONE_HEX[tone];
  const hollow = tone === "todo";
  const live = node.status === "in_progress";
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      {goal ? (
        <>
          <rect x={-half} y={-half} width={size} height={size} rx="5" fill={BRAND[600]} />
          <rect x={-half + 0.75} y={-half + 0.75} width={size - 1.5} height={size - 1.5} rx="4.25" fill="none" stroke={`url(#${frame})`} strokeWidth="1.5" />
        </>
      ) : (
        <rect x={-half} y={-half} width={size} height={size} rx="3" fill={agentTone(node.tone)} opacity="0.92" />
      )}
      {!goal && (
        <g transform={`translate(${half - 0.5} ${-half + 0.5})`}>
          {live && <circle r="3.6" fill={dot} className="home-presence" style={{ animationDelay: `${(index % 5) * 0.35}s` }} />}
          <circle r="3.6" className="home-presence-ring" />
          <circle r="2.4" fill={hollow ? "none" : dot} stroke={hollow ? STATUS_HEX.todo : "none"} strokeWidth="1.2" />
        </g>
      )}
    </g>
  );
}
