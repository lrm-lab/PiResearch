// The star map (DESIGN.md §3): the server's 2D constellation layout, seen flat. Tasks are CoForge-style
// agent avatar tiles with a presence-dot status, the goal is a compact card, parent edges are hairlines,
// labels are quiet DOM text, and verification relations are drawn on demand (hover, focus, selection,
// or the 核验透镜).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ariaLabel, progress, stateText, toolCount } from "../../lib/activity";
import { drawnRelation, errorTargets, linkedIds, verificationIds } from "../../lib/edges";
import { BRAND, LAVENDER, RELATION_HEX } from "../../lib/palette";
import { TONE_HEX, taskTone, type TaskTone } from "../../lib/status";
import { useTheme } from "../../lib/theme";
import type { Edge, Snapshot, ViewNode } from "../../types/api";
import { cx } from "../../ui/cx";
import { selectionHeading } from "../../lib/heading";
import { agentRoster } from "../model";
import { useStudy } from "../store";
import { useStudyUi } from "../ui";
import { bendOf, edgeGeometry, edgeLabel, parentDepths, spreadEdgeLabels, visibleRelationEdges, type EdgeGeometry } from "./edges";
import { chooseGoalTier, estimateChip, estimateCompact, estimateGoalCard, placeLabels, type LabelItem, type LabelSpot, type Rect } from "./labels";
import { dirOfKey, nextInDirection } from "./nav";
import { GoalCard, NodeTile } from "./NodeTile";
import { NodePopover, useDwell } from "./NodePopover";
import { boxRim, focusTransform, nodeBounds, orbRadius, toScreen, type Point } from "./transform";
import { useViewport } from "./useViewport";
import "./starmap.css";

interface Star {
  node: ViewNode;
  tone: TaskTone;
  calls: number;
  depth: number;
  label: string;
}

/** Space kept between a tile and anything drawn next to it (the presence dot sticks out ~4px). */
const TILE_PAD = 6;

/** "T12 · 进行中 · 7 次调用" */
function metaOf(view: Snapshot, star: Star): string {
  const parts = [star.label, stateText(view, star.node)];
  if (star.calls > 0) parts.push(`${star.calls} 次调用`);
  return parts.join(" · ");
}

export function StarMap({ view, rightInset, bottomInset, compact }: { view: Snapshot; rightInset: number; bottomInset: number; compact: boolean }) {
  const theme = useTheme();
  const reduced = useStudy((s) => s.reducedMotion);
  const selectedId = useStudy((s) => s.selectedId);
  const hoveredId = useStudy((s) => s.hoveredId);
  const lens = useStudy((s) => s.lens);
  const select = useStudy((s) => s.select);
  const hover = useStudy((s) => s.hover);
  const unhover = useStudy((s) => s.unhover);
  const focusAgent = useStudyUi((s) => s.focusAgent);
  const fitRequest = useStudyUi((s) => s.fitRequest);
  const zoomRequest = useStudyUi((s) => s.zoomRequest);

  const bounds = useMemo(() => nodeBounds(view.nodes), [view.nodes]);
  const vp = useViewport(bounds, reduced);
  const { t, size } = vp;
  const [focusId, setFocusId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const goal = useMemo(() => view.nodes.find((n) => n.goal) ?? null, [view.nodes]);
  const erroneous = useMemo(() => errorTargets(view.edges), [view.edges]);
  const depths = useMemo(() => parentDepths(view.nodes.map((n) => n.id), view.edges, goal?.id ?? null), [view.nodes, view.edges, goal]);
  const byId = useMemo(() => new Map(view.nodes.map((n) => [n.id, n] as const)), [view.nodes]);
  const roster = useMemo(() => new Map(agentRoster(view).map((entry) => [entry.agent, entry.tone] as const)), [view]);

  const stars = useMemo<Star[]>(
    () =>
      view.nodes.map((node) => ({
        node,
        tone: node.goal ? "progress" : taskTone(node.status, erroneous.has(node.id)),
        calls: toolCount(node),
        depth: depths.get(node.id) ?? 0,
        label: node.goal ? "研究问题" : node.id.toUpperCase(),
      })),
    [view.nodes, erroneous, depths],
  );

  // Intro: nodes fade in by depth; nodes that appear later fade in at once.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIntroDone(true), 2400);
    return () => window.clearTimeout(timer);
  }, []);
  const delays = useRef(new Map<string, number>());
  const delayOf = (id: string, depth: number) => {
    let d = delays.current.get(id);
    if (d === undefined) {
      d = reduced || introDone ? 0 : 0.1 + Math.min(depth, 8) * 0.14;
      delays.current.set(id, d);
    }
    return d;
  };

  // The selection keeps its relations drawn while something else is hovered.
  const focus = useMemo(() => [...new Set([hoveredId, selectedId].filter((id): id is string => id !== null))], [hoveredId, selectedId]);
  const linked = useMemo(() => {
    if (!focus.length) return null;
    const out = new Set<string>();
    for (const id of focus) for (const other of linkedIds(view.edges, id)) out.add(other);
    return out;
  }, [view.edges, focus]);
  const verification = useMemo(() => (lens ? verificationIds(view.edges) : null), [lens, view.edges]);
  const dimmed = (star: Star): boolean => {
    if (focusAgent && !star.node.goal && !star.node.agents.includes(focusAgent)) return true;
    if (!linked && !verification) return false;
    if (linked?.has(star.node.id) || verification?.has(star.node.id)) return false;
    return true;
  };

  // Screen positions. `hw` / `hh` is the half extent of the node's box, for edges and label collision.
  const goalTitle = goal ? selectionHeading(goal.title, true) : "";
  const { pos, goalTier, goalBox } = useMemo(() => {
    const tiles: { x: number; y: number; r: number }[] = [];
    const map = new Map<string, { p: Point; r: number; hw: number; hh: number }>();
    for (const star of stars) {
      if (star.node.goal) continue;
      const p = toScreen(t, star.node);
      const r = orbRadius(star.node.radius, t.k, false, compact);
      map.set(star.node.id, { p, r, hw: r, hh: r });
      tiles.push({ x: p.x, y: p.y, r });
    }
    const tier = goal ? chooseGoalTier(goalTitle, toScreen(t, goal), tiles, compact ? 1 : 0) : 0;
    const box = estimateGoalCard(goalTitle, tier);
    if (goal) map.set(goal.id, { p: toScreen(t, goal), r: box.h / 2, hw: box.w / 2, hh: box.h / 2 });
    return { pos: map, goalTier: tier, goalBox: box };
  }, [stars, t, goal, goalTitle, compact]);

  // Labels.
  const running = view.running !== false;
  const compactOnly = compact;
  const liveOf = (node: ViewNode) => (running && node.status === "in_progress" && node.live.length ? node.live[node.live.length - 1]! : undefined);
  const spots = useMemo(() => {
    if (size.w < 10) return new Map<string, LabelSpot | null>();
    const obstacles: Rect[] = [];
    const items: LabelItem[] = [];
    for (const star of stars) {
      const { p, r, hw, hh } = pos.get(star.node.id)!;
      if (star.node.goal) {
        obstacles.push({ x: p.x - hw - 4, y: p.y - hh - 4, w: hw * 2 + 8, h: hh * 2 + 8 });
        continue;
      }
      const forced = focus.includes(star.node.id);
      const isLinked = linked?.has(star.node.id) ?? false;
      let priority = star.node.radius;
      if (star.node.status === "in_progress") priority += 300;
      if (star.tone === "error") priority += 250;
      if (star.node.weight === "hub") priority += 150;
      if (isLinked) priority += 600;
      const live = liveOf(star.node);
      const full = estimateChip(star.node.title, metaOf(view, star), { live: live ? live.label : undefined });
      const small = estimateCompact(star.node.id);
      items.push({
        id: star.node.id,
        x: p.x,
        y: p.y,
        r: r + TILE_PAD,
        priority,
        full: compactOnly && !forced ? small : full,
        compact: small,
        forced,
      });
    }
    return placeLabels(items, size, 6, obstacles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars, pos, size, focus, linked, compactOnly, running, view]);

  // Relation edges on demand.
  const relationEdges = useMemo(() => {
    if (focus.length < 2) return visibleRelationEdges(view.edges, focus[0] ?? null, lens);
    const seen = new Set<Edge>();
    for (const id of focus) for (const edge of visibleRelationEdges(view.edges, id, lens)) seen.add(edge);
    return [...seen];
  }, [view.edges, focus, lens]);
  const parentEdges = useMemo(() => view.edges.filter((e) => e.relation === "parent" && byId.has(e.from) && byId.has(e.to)), [view.edges, byId]);

  // Edge ends sit on the node's box edge (the goal card's side, a tile's rim), not at its centre.
  const edgeGeo = (edge: Edge, bend: number, gapA: number, gapB: number) => {
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (!a || !b) return null;
    const dx = b.p.x - a.p.x;
    const dy = b.p.y - a.p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return edgeGeometry(a.p, b.p, boxRim(ux, uy, a.hw, a.hh, gapA), boxRim(-ux, -uy, b.hw, b.hh, gapB), bend);
  };
  const rels: { key: string; geo: EdgeGeometry; rel: ReturnType<typeof drawnRelation>; edge: Edge }[] = [];
  const parentLabels: typeof rels = [];
  let relIndex = 0;
  for (const edge of relationEdges) {
    const key = `${edge.from}>${edge.to}:${edge.relation}`;
    if (edge.relation === "parent") {
      if (!focus.length) continue;
      const geo = edgeGeo(edge, (bendOf(`${edge.from}>${edge.to}`) - 0.5) * 0.22, 3, 3);
      if (geo) parentLabels.push({ key, geo, rel: "parent", edge });
      continue;
    }
    const bend = (bendOf(key) > 0.5 ? 1 : -1) * (0.22 + (relIndex % 3) * 0.05);
    relIndex += 1;
    const geo = edgeGeo(edge, bend, 5, 8);
    if (geo) rels.push({ key, geo, rel: drawnRelation(edge.relation), edge });
  }

  const labelAll = [...rels, ...parentLabels];
  const labelPoints = spreadEdgeLabels(labelAll.map((entry) => entry.geo));
  const labelled = labelAll.map((entry, i) => ({ ...entry, at: labelPoints[i]! }));

  // Selection pans the node into the free area.
  useEffect(() => {
    if (!selectedId || size.w < 10) return;
    const node = byId.get(selectedId);
    if (!node) return;
    vp.flyTo(focusTransform(vp.t, node, size, { right: rightInset, bottom: bottomInset }));
    // Only on selection / inset changes, never on every transform tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rightInset, bottomInset, size.w > 10]);

  // F key / fit button and zoom buttons arrive as request counters.
  const first = useRef({ fit: fitRequest, zoom: zoomRequest.n });
  useEffect(() => {
    if (fitRequest !== first.current.fit) {
      first.current.fit = fitRequest;
      vp.fitView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);
  useEffect(() => {
    if (zoomRequest.n !== first.current.zoom) {
      first.current.zoom = zoomRequest.n;
      vp.zoomBy(zoomRequest.factor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest]);

  // Keyboard: arrows move between nodes, Enter / Space select.
  const order = useMemo(() => [...stars].sort((a, b) => Number(b.node.goal) - Number(a.node.goal)), [stars]);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const dir = dirOfKey(event.key);
      if (!dir) return;
      event.preventDefault();
      const from = (event.target as Element).closest("[data-star]")?.getAttribute("data-star") ?? null;
      const points = order.map((s) => ({ id: s.node.id, ...pos.get(s.node.id)!.p }));
      const next = nextInDirection(points, from, dir);
      if (!next) return;
      rootRef.current?.querySelector<HTMLElement>(`[data-star="${CSS.escape(next)}"]`)?.focus();
      const at = pos.get(next)!.p;
      const m = 70;
      if (at.x < m || at.y < m || at.x > size.w - m - rightInset || at.y > size.h - m - bottomInset) {
        const node = byId.get(next)!;
        vp.flyTo(focusTransform(vp.t, node, size, { right: rightInset, bottom: bottomInset }));
      }
    },
    [order, pos, size, rightInset, bottomInset, byId, vp],
  );

  const roving = focusId ?? selectedId ?? goal?.id ?? null;
  const brand = theme === "dark" ? BRAND[400] : BRAND[600];
  const { resolved, total } = progress(view);
  const toggle = (id: string) => select(selectedId === id ? null : id);
  const handlers = {
    onToggle: toggle,
    onSelect: select,
    onHover: hover,
    onUnhover: unhover,
    onFocus: (id: string, visible: boolean) => {
      setFocusId(id);
      if (visible) hover(id);
    },
    onBlur: unhover,
  };

  // The hover card appears after a short dwell, never while dragging, never for the goal.
  const popId = useDwell(hoveredId && hoveredId !== goal?.id ? hoveredId : null, 250, vp.moving);
  const popStar = popId ? stars.find((s) => s.node.id === popId) : undefined;

  const goalPos = goal ? pos.get(goal.id) : undefined;

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        vp.setEl(el);
      }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // A click on the empty map clears the selection.
        if (event.target === event.currentTarget || (event.target as HTMLElement | SVGElement).dataset?.bg !== undefined) select(null);
      }}
      tabIndex={-1}
      role="group"
      aria-label="任务星图"
      className="sm-root absolute inset-0 touch-none overflow-hidden bg-primary outline-none data-[panning]:cursor-grabbing [cursor:grab]"
    >
      <MapBackdrop x={goalPos?.p.x} y={goalPos?.p.y} tx={t.x} ty={t.y}  />

      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden={undefined} data-bg>
        <defs>
          {(["audit", "support", "challenge", "error"] as const).map((rel) => (
            <marker key={rel} id={`arrow-${rel}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
              <path d="M1.5 1.5L8.5 5L1.5 8.5z" fill={RELATION_HEX[rel]} fillOpacity="0.9" />
            </marker>
          ))}
          {/* Violet hairline for the parent lines of the hovered / selected node. */}
          {parentEdges.map((edge, index) => {
            if (!focus.includes(edge.from) && !focus.includes(edge.to)) return null;
            const key = `${edge.from}>${edge.to}`;
            const geo = edgeGeo(edge, (bendOf(key) - 0.5) * 0.22, 3, 3);
            if (!geo) return null;
            return (
              <linearGradient key={`${key}#${index}`} id={`sel-${index}`} gradientUnits="userSpaceOnUse" x1={geo.from.x} y1={geo.from.y} x2={geo.to.x} y2={geo.to.y}>
                <stop offset="0%" stopColor={LAVENDER} />
                <stop offset="100%" stopColor={brand} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Parent lines: 1px hairlines, gently curved, fading in as they draw. */}
        <g fill="none" strokeLinecap="round">
          {parentEdges.map((edge, index) => {
            const key = `${edge.from}>${edge.to}`;
            const geo = edgeGeo(edge, (bendOf(key) - 0.5) * 0.22, 3, 3);
            if (!geo) return null;
            const child = byId.get(edge.to)!;
            const incident = focus.includes(edge.from) || focus.includes(edge.to);
            const faded = (focus.length > 0 && !incident) || (lens && !incident);
            const delay = Math.max(0, delayOf(edge.to, depths.get(edge.to) ?? 1) - 0.1);
            const flowing = running && !reduced && child.status === "in_progress";
            return (
              <g key={`${key}#${index}`} style={{ opacity: faded ? 0.35 : 1, transition: "opacity .25s var(--ease-out-quint)" }}>
                <path
                  d={geo.d}
                  pathLength={1}
                  className="sm-draw"
                  style={{ "--sm-delay": `${delay}s`, stroke: incident ? `url(#sel-${index})` : "var(--sm-line)" } as CSSProperties}
                  strokeWidth={1}
                />
                {flowing && (
                  <circle r="1.6" className="sm-dot-flow" style={{ offsetPath: `path("${geo.d}")`, fill: TONE_HEX.progress }} />
                )}
              </g>
            );
          })}
        </g>

        {/* Verification relations: only on demand. */}
        <g fill="none" strokeLinecap="round">
          {rels.map(({ key, geo, rel }) => (
            <path
              key={key}
              d={geo.d}
              pathLength={1}
              className="sm-draw"
              stroke={RELATION_HEX[rel]}
              strokeOpacity="0.8"
              strokeWidth={1.5}
              markerEnd={`url(#arrow-${rel})`}
            />
          ))}
        </g>
      </svg>

      {/* Nodes */}
      {stars.map((star) => {
        const { node } = star;
        const { p, r } = pos.get(node.id)!;
        const common = {
          ...handlers,
          node,
          x: p.x,
          y: p.y,
          selected: selectedId === node.id,
          hot: hoveredId === node.id,
          dim: !node.goal && dimmed(star),
          roving: roving === node.id,
          label: ariaLabel(view, node),
          delay: delayOf(node.id, star.depth),
        };
        return node.goal ? (
          <GoalCard key={node.id} {...common} width={goalBox.w} title={goalTitle} resolved={resolved} total={total} running={running} tier={goalTier} />
        ) : (
          <NodeTile key={node.id} {...common} r={r} tone={star.tone} running={running} />
        );
      })}

      {/* Edge labels: small pills */}
      {labelled.map(({ key, at, rel, edge }) => (
        <span
          key={`label-${key}`}
          data-ui
          className="sm-edge-label pointer-events-none absolute z-20 inline-flex items-center gap-1.5 rounded-full border border-secondary bg-primary px-2 py-0.5 text-xs font-medium whitespace-nowrap text-secondary shadow-xs"
          style={{ left: at.x, top: at.y, transform: "translate(-50%, -50%)" }}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: RELATION_HEX[rel] }} />
          {rel === "parent" && focus.includes(edge.to) && !focus.includes(edge.from) ? "上级任务" : edgeLabel(edge)}
        </span>
      ))}

      {/* Labels: quiet text beside each tile */}
      {stars.map((star) => {
        const spot = spots.get(star.node.id);
        if (!spot || star.node.goal) return null;
        const { node } = star;
        const forced = focus.includes(node.id);
        const small = spot.compact || (compactOnly && !forced);
        const live = liveOf(node);
        const isDim = dimmed(star);
        return (
          <button
            key={node.id}
            type="button"
            tabIndex={-1}
            data-label={node.id}
            onClick={() => toggle(node.id)}
            onPointerEnter={(event) => event.pointerType !== "touch" && hover(node.id)}
            onPointerLeave={(event) => event.pointerType !== "touch" && unhover(node.id)}
            className={cx(
              "sm-label absolute z-10 block rounded-md bg-primary/80 text-left backdrop-blur-sm outline-none",
              small ? "px-1 py-px text-xs" : "px-1.5 py-0.5",
            )}
            style={{
              left: spot.px,
              top: spot.py,
              transform: `translate(${-spot.fx * 100}%, ${-spot.fy * 100}%)`,
              maxWidth: 176,
              opacity: isDim ? 0.3 : 1,
              transition: "opacity .25s var(--ease-out-quint)",
              "--sm-delay": `${Math.max(0, (delays.current.get(node.id) ?? 0) + 0.2)}s`,
            } as CSSProperties}
          >
            {small ? (
              <span className="font-mono font-medium text-tertiary">{star.label}</span>
            ) : (
              <>
                <span className={cx("block max-w-40 truncate text-sm leading-5 font-medium text-primary", node.status === "cancelled" && "text-tertiary line-through decoration-1")}>
                  {node.title || "未命名任务"}
                </span>
                <span className="block truncate text-xs leading-4 text-tertiary">{metaOf(view, star)}</span>
                {live && (
                  <span className="mt-0.5 block truncate font-mono text-xs leading-4 text-brand-secondary">
                    {live.tool === "思考" ? (
                      <span className="prism-shimmer [--shimmer-contrast:var(--color-brand-600)]">{live.hint || "正在想下一步"}</span>
                    ) : (
                      <span className="prism-caret">{live.label}</span>
                    )}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}

      {popStar && pos.get(popStar.node.id) && (
        <PopoverAt
          view={view}
          star={popStar}
          pos={pos.get(popStar.node.id)!}
          size={size}
          above={spots.get(popStar.node.id)?.fy === 1}
          byId={byId}
          roster={roster}
          rightInset={rightInset}
        />
      )}

      {total === 0 && size.w > 10 && <EmptyHint planning={running} />}
    </div>
  );
}

function PopoverAt({
  view,
  star,
  pos,
  size,
  above,
  byId,
  roster,
  rightInset,
}: {
  view: Snapshot;
  star: Star;
  pos: { p: Point; r: number };
  size: { w: number; h: number };
  /** The node's label sits above it, so the card goes below. */
  above: boolean;
  byId: Map<string, ViewNode>;
  roster: Map<string, ViewNode["tone"]>;
  rightInset: number;
}) {
  const { node } = star;
  const latest = node.live.length ? node.live[node.live.length - 1]!.label : node.steps.length ? node.steps[node.steps.length - 1]!.label : null;
  // Prefer above the node; go below when there is no room (or the label sits above).
  const below = above || pos.p.y - pos.r - 12 < 190;
  return (
    <NodePopover
      view={view}
      node={node}
      tone={star.tone}
      x={pos.p.x}
      y={pos.p.y}
      r={pos.r}
      bounds={{ w: size.w - rightInset, h: size.h }}
      below={below}
      latest={latest}
      byId={byId}
      roster={roster}
    />
  );
}

/** Plain ground, one soft violet glow behind the goal, CoForge's faint sidebar wash, an ultra-faint dot
 *  grid that moves with the map, and (dark only) a few barely-there specks. */
export function MapBackdrop({ x, y, tx = 0, ty = 0, opacity = 1 }: { x?: number; y?: number; tx?: number; ty?: number; opacity?: number }) {
  return (
    <div data-bg className="absolute inset-0" aria-hidden="true">
      <div data-bg className="sm-wash" />
      <div
        data-bg
        className="sm-glow"
        style={{ opacity, ...(x !== undefined && y !== undefined ? { "--sm-gx": `${x}px`, "--sm-gy": `${y}px` } : {}) } as CSSProperties}
      />
      <div data-bg className="sm-grid" style={{ backgroundPosition: `${tx}px ${ty}px` }} />
      <div data-bg className="sm-specks" style={{ translate: `${tx * 0.04}px ${ty * 0.04}px` }} />
    </div>
  );
}

function EmptyHint({ planning }: { planning: boolean }) {
  return (
    <div data-ui className="pointer-events-none absolute inset-x-0 bottom-[22%] flex flex-col items-center gap-1 px-6 text-center">
      <p className={cx("text-md font-semibold text-primary", planning && "prism-shimmer")}>{planning ? "正在拆解研究问题" : "没有拆出任务"}</p>
      <p className="text-sm text-tertiary">{planning ? "智能体拆解问题后，任务会作为节点出现在这里。" : "这次研究没有留下可以展示的任务。"}</p>
    </div>
  );
}
