// The star map (DESIGN.md §3): the server's 2D constellation layout, seen flat. Stars are SVG orbs
// with a CoForge status ring, parent edges are the constellation lines, labels are crisp DOM chips,
// and verification relations are drawn on demand (hover, focus, selection, or the 核验透镜).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ariaLabel, progress, toolCount } from "../../lib/activity";
import { drawnRelation, errorTargets, linkedIds, verificationIds } from "../../lib/edges";
import { AGENT_TONES, agentTone, BRAND, RELATION_HEX } from "../../lib/palette";
import { TONE_HEX, TONE_RING, taskTone, type TaskTone } from "../../lib/status";
import { useTheme } from "../../lib/theme";
import type { Edge, Snapshot, ViewNode } from "../../types/api";
import { cx } from "../../ui/cx";
import { selectionHeading } from "../../lib/heading";
import { useStudy } from "../store";
import { useStudyUi } from "../ui";
import { hexId, mixHex } from "./color";
import { bendOf, edgeGeometry, edgeLabel, parentDepths, spreadEdgeLabels, visibleRelationEdges, type EdgeGeometry } from "./edges";
import { estimateChip, estimateCompact, placeLabels, type LabelItem, type LabelSpot } from "./labels";
import { dirOfKey, nextInDirection } from "./nav";
import { focusTransform, nodeBounds, orbRadius, toScreen, type Point } from "./transform";
import { useViewport } from "./useViewport";
import "./starmap.css";

interface Star {
  node: ViewNode;
  tone: TaskTone;
  hex: string;
  calls: number;
  depth: number;
  label: string;
}

const RING_GAP = 5;

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

  const stars = useMemo<Star[]>(
    () =>
      view.nodes.map((node) => ({
        node,
        tone: node.goal ? "progress" : taskTone(node.status, erroneous.has(node.id)),
        hex: agentTone(node.tone),
        calls: toolCount(node),
        depth: depths.get(node.id) ?? 0,
        label: node.goal ? "研究问题" : node.id.toUpperCase(),
      })),
    [view.nodes, erroneous, depths],
  );

  // Intro: stars fade in by depth; nodes that appear later twinkle in at once.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIntroDone(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  const delays = useRef(new Map<string, number>());
  const delayOf = (id: string, depth: number) => {
    let d = delays.current.get(id);
    if (d === undefined) {
      d = reduced || introDone ? 0 : 0.1 + Math.min(depth, 8) * 0.18;
      delays.current.set(id, d);
    }
    return d;
  };

  // Emphasis: what is hovered / focused, else what is selected.
  const active = hoveredId ?? selectedId;
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

  // Screen positions.
  const pos = useMemo(() => {
    const map = new Map<string, { p: Point; r: number }>();
    for (const star of stars) {
      map.set(star.node.id, { p: toScreen(t, star.node), r: orbRadius(star.node.radius, t.k, star.node.goal) });
    }
    return map;
  }, [stars, t]);

  // Labels.
  const running = view.running !== false;
  const compactOnly = compact;
  const liveOf = (node: ViewNode) => (running && node.status === "in_progress" && node.live.length ? node.live[node.live.length - 1]! : undefined);
  const spots = useMemo(() => {
    if (size.w < 10) return new Map<string, LabelSpot | null>();
    const items: LabelItem[] = stars.map((star) => {
      const { p, r } = pos.get(star.node.id)!;
      const forced = focus.includes(star.node.id);
      const isLinked = linked?.has(star.node.id) ?? false;
      let priority = star.node.radius;
      if (star.node.goal) priority = 1000;
      else if (star.node.status === "in_progress") priority += 300;
      if (star.tone === "error") priority += 250;
      if (star.node.weight === "hub") priority += 150;
      if (isLinked) priority += 600;
      const hasLive = Boolean(liveOf(star.node));
      const full = star.node.goal
        ? estimateChip("", selectionHeading(star.node.title, true), { goal: true })
        : estimateChip(star.node.id, star.node.title, { live: hasLive });
      const small = star.node.goal ? { w: 74, h: 22 } : estimateCompact(star.node.id);
      return {
        id: star.node.id,
        x: p.x,
        y: p.y,
        r: r + RING_GAP + 4,
        priority,
        full: compactOnly && !forced ? small : full,
        compact: small,
        forced,
      };
    });
    return placeLabels(items, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars, pos, size, focus, linked, compactOnly, running]);

  // Relation edges on demand.
  const relationEdges = useMemo(() => {
    if (focus.length < 2) return visibleRelationEdges(view.edges, focus[0] ?? null, lens);
    const seen = new Set<Edge>();
    for (const id of focus) for (const edge of visibleRelationEdges(view.edges, id, lens)) seen.add(edge);
    return [...seen];
  }, [view.edges, focus, lens]);
  const parentEdges = useMemo(() => view.edges.filter((e) => e.relation === "parent" && byId.has(e.from) && byId.has(e.to)), [view.edges, byId]);

  // Geometry of the on-demand edges (verification lines, plus labels for the active node's parent edges).
  const edgeGeo = (edge: Edge, bend: number, padB: number) => {
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (!a || !b) return null;
    return edgeGeometry(a.p, b.p, a.r + RING_GAP + 3, b.r + RING_GAP + padB, bend);
  };
  const rels: { key: string; geo: EdgeGeometry; rel: ReturnType<typeof drawnRelation>; edge: Edge }[] = [];
  const parentLabels: typeof rels = [];
  let relIndex = 0;
  for (const edge of relationEdges) {
    const key = `${edge.from}>${edge.to}:${edge.relation}`;
    if (edge.relation === "parent") {
      if (!focus.length) continue;
      const geo = edgeGeo(edge, (bendOf(`${edge.from}>${edge.to}`) - 0.5) * 0.22, 3);
      if (geo) parentLabels.push({ key, geo, rel: "parent", edge });
      continue;
    }
    const bend = (bendOf(key) > 0.5 ? 1 : -1) * (0.22 + (relIndex % 3) * 0.05);
    relIndex += 1;
    const geo = edgeGeo(edge, bend, 6);
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

  // Keyboard: arrows move between stars, Enter / Space select.
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
      rootRef.current?.querySelector<SVGGElement>(`[data-star="${CSS.escape(next)}"]`)?.focus();
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
  const colors = useMemo(() => {
    const set = new Set<string>([...AGENT_TONES, agentTone("pending"), BRAND[600]]);
    for (const s of stars) set.add(s.hex);
    return [...set];
  }, [stars]);
  const { resolved, total } = progress(view);
  const tasks = total;
  const toggle = (id: string) => select(selectedId === id ? null : id);
  const sorted = useMemo(
    () => [...stars].sort((a, b) => Number(b.node.goal) - Number(a.node.goal) || b.node.radius - a.node.radius),
    [stars],
  );
  // The active star is drawn last so its ring and orbit sit on top.
  const drawOrder = active ? [...sorted.filter((s) => s.node.id !== active), ...sorted.filter((s) => s.node.id === active)] : sorted;

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
      <div data-bg className="absolute inset-0">
        <div data-bg className="sm-nebula" style={{ transform: undefined }} />
        <div data-bg className="sm-stars" style={{ translate: `${t.x * 0.04}px ${t.y * 0.04}px` }}>
          <i />
          <i />
          <i />
        </div>
      </div>

      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden={undefined} data-bg>
        <defs>
          {colors.map((hex) => (
            <g key={hex}>
              <radialGradient id={`glow-${hexId(hex)}`}>
                <stop offset="0%" stopColor={hex} stopOpacity="0.5" />
                <stop offset="45%" stopColor={hex} stopOpacity="0.18" />
                <stop offset="100%" stopColor={hex} stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`body-${hexId(hex)}`} cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor={mixHex(hex, "#ffffff", 0.55)} />
                <stop offset="55%" stopColor={hex} />
                <stop offset="100%" stopColor={mixHex(hex, "#000000", 0.25)} />
              </radialGradient>
            </g>
          ))}
          {(["audit", "support", "challenge", "error"] as const).map((rel) => (
            <marker key={rel} id={`arrow-${rel}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M1 1.2L9 5L1 8.8z" fill={RELATION_HEX[rel]} />
            </marker>
          ))}
        </defs>

        {/* Constellation lines (parent edges): always visible, thin, gently curved. */}
        <g fill="none" strokeLinecap="round">
          {parentEdges.map((edge, index) => {
            const a = pos.get(edge.from)!;
            const b = pos.get(edge.to)!;
            const key = `${edge.from}>${edge.to}`;
            const geo = edgeGeometry(a.p, b.p, a.r + RING_GAP + 3, b.r + RING_GAP + 3, (bendOf(key) - 0.5) * 0.22);
            const child = byId.get(edge.to)!;
            const incident = focus.includes(edge.from) || focus.includes(edge.to);
            const faded = (focus.length > 0 && !incident) || (lens && !incident);
            const delay = Math.max(0, delayOf(edge.to, depths.get(edge.to) ?? 1) - 0.12);
            const flowing = running && child.status === "in_progress";
            return (
              <g key={`${key}#${index}`} style={{ opacity: faded ? 0.3 : 1, transition: "opacity .25s" }}>
                <path
                  d={geo.d}
                  pathLength={1}
                  className="sm-draw"
                  style={{ "--sm-delay": `${delay}s` } as CSSProperties}
                  stroke={RELATION_HEX.parent}
                  strokeWidth={incident ? 2.2 : 1.4}
                  opacity={incident ? 1 : 0.85}
                />
                {flowing && <path d={geo.d} className="sm-flow" stroke={TONE_HEX.progress} strokeWidth={1.8} opacity={0.9} />}
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
              strokeWidth={rel === "error" ? 2.8 : 2.2}
              markerEnd={rel === "parent" ? undefined : `url(#arrow-${rel})`}
              style={{ filter: `drop-shadow(0 0 3px ${RELATION_HEX[rel]}66)` }}
            />
          ))}
        </g>

        {drawOrder.map((star) => {
          const { node, tone } = star;
          const { p, r } = pos.get(node.id)!;
          const ringR = r + RING_GAP;
          const isSelected = selectedId === node.id;
          const live = running ? node.live.filter((c) => c.tool !== "思考").length : 0;
          const inProgress = running && node.status === "in_progress";
          const orbiters = Math.min(3, Math.max(live, 1));
          const fill = node.goal ? (total ? resolved / total : 0) : TONE_RING[tone].fill;
          const ringHex = node.goal ? brand : TONE_HEX[tone];
          const mark = node.goal ? undefined : TONE_RING[tone].mark;
          const delay = delayOf(node.id, star.depth);
          return (
            <g key={node.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} style={{ opacity: dimmed(star) ? 0.26 : 1, transition: "opacity .25s" }}>
              <g
                className="sm-hit"
                data-star={node.id}
                role="button"
                tabIndex={roving === node.id ? 0 : -1}
                aria-label={ariaLabel(view, node)}
                aria-pressed={isSelected}
                onClick={() => toggle(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    select(node.id);
                  }
                }}
                onPointerEnter={(event) => event.pointerType !== "touch" && hover(node.id)}
                onPointerLeave={(event) => event.pointerType !== "touch" && unhover(node.id)}
                onFocus={(event) => {
                  setFocusId(node.id);
                  if (event.currentTarget.matches(":focus-visible")) hover(node.id);
                }}
                onBlur={() => unhover(node.id)}
              >
                <circle r={Math.max(ringR + 8, 18)} fill="transparent" />
                <g className="sm-star" style={{ "--sm-delay": `${delay}s` } as CSSProperties}>
                  <circle r={r * 2.6} fill={`url(#glow-${hexId(star.hex)})`} className={cx(inProgress && "sm-pulse")} pointerEvents="none" />
                  {tone === "error" && !node.goal && <circle r={ringR + 7} fill="none" stroke={TONE_HEX.error} strokeOpacity="0.35" strokeWidth="6" className="sm-pulse" pointerEvents="none" />}
                  <g className="sm-core" opacity={node.status === "cancelled" ? 0.5 : 1}>
                    <circle r={r} fill={`url(#body-${hexId(star.hex)})`} />
                    <circle cx={-r * 0.3} cy={-r * 0.34} r={r * 0.22} fill="#ffffff" opacity="0.5" />
                  </g>
                  {node.goal && (
                    <g className="sm-spin" pointerEvents="none">
                      <circle r={ringR + 9} fill="none" stroke={brand} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 7" />
                    </g>
                  )}
                  {/* Status ring: a faint track plus an arc that grows with the status. */}
                  <circle r={ringR} fill="none" stroke={ringHex} strokeOpacity={tone === "todo" && !node.goal ? 0.9 : 0.22} strokeWidth={tone === "todo" && !node.goal ? 1.5 : 2.5} strokeDasharray={tone === "todo" && !node.goal ? "2.5 3.5" : undefined} pointerEvents="none" />
                  {fill > 0 && (
                    <g className={cx(inProgress && "sm-spin")} pointerEvents="none">
                      <circle
                        r={ringR}
                        fill="none"
                        stroke={ringHex}
                        strokeWidth={2.5}
                        strokeLinecap={fill >= 1 ? "butt" : "round"}
                        pathLength={100}
                        strokeDasharray={`${Math.max(fill * 100, 4)} 100`}
                        transform="rotate(-90)"
                        className="sm-ring"
                      />
                    </g>
                  )}
                  {mark && (
                    <g transform={`translate(${(ringR * 0.7071).toFixed(1)} ${(-ringR * 0.7071).toFixed(1)})`} pointerEvents="none">
                      <g key={tone} className="sm-mark">
                        <circle r="7" fill={ringHex} stroke="var(--color-bg-primary)" strokeWidth="1.5" />
                        <g transform="translate(-6 -6) scale(.75)" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          {mark === "check" && <path d="M5.2 8.2l1.9 1.9 3.7-3.9" />}
                          {mark === "cross" && <path d="M6 6l4 4M10 6l-4 4" />}
                          {mark === "bang" && <path d="M8 4.8v3.8M8 10.9v.1" />}
                        </g>
                      </g>
                    </g>
                  )}
                  {isSelected && <circle r={ringR + 6} fill="none" stroke={brand} strokeWidth="2" pointerEvents="none" />}
                  <circle className="sm-focus" r={ringR + 8} fill="none" stroke="var(--color-focus-ring)" strokeWidth="2" pointerEvents="none" />
                  {inProgress &&
                    Array.from({ length: orbiters }, (_, i) => (
                      <g key={i} className="sm-orbit" style={{ animationDuration: `${4.5 + i * 1.3}s`, animationDelay: `${-i * 1.1}s` }} pointerEvents="none">
                        <g transform={`rotate(${(360 / orbiters) * i + 40})`}>
                          <circle cx={ringR + 9} r={live ? 3 : 2} fill={star.hex} stroke="var(--color-bg-primary)" strokeWidth="1.2" />
                        </g>
                      </g>
                    ))}
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Edge labels */}
      {labelled.map(({ key, at, rel, edge }) => (
        <span
          key={`label-${key}`}
          data-ui
          className="sm-edge-label pointer-events-none absolute z-20 inline-flex items-center gap-1 rounded-full border border-secondary bg-primary px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-secondary shadow-sm"
          style={{ left: at.x, top: at.y, transform: "translate(-50%, -50%)" }}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: RELATION_HEX[rel] }} />
          {rel === "parent" && focus.includes(edge.to) && !focus.includes(edge.from) ? "上级任务" : edgeLabel(edge)}
        </span>
      ))}

      {/* Label chips */}
      {stars.map((star) => {
        const spot = spots.get(star.node.id);
        if (!spot) return null;
        const { node } = star;
        const forced = focus.includes(node.id);
        const small = spot.compact || (compactOnly && !forced);
        const live = liveOf(node);
        const isSelected = selectedId === node.id;
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
              "sm-chip-in absolute z-10 block rounded-lg border bg-primary/90 text-left shadow-xs backdrop-blur-sm outline-none",
              small ? "px-1.5 py-0.5 text-xs" : node.goal ? "px-3 py-2" : "px-2 py-1 text-sm",
              isSelected ? "border-brand shadow-md" : star.tone === "error" ? "border-error" : node.goal ? "border-brand bg-brand-primary" : "border-secondary",
              forced && "z-20 shadow-md",
            )}
            style={{
              left: spot.px,
              top: spot.py,
              transform: `translate(${-spot.fx * 100}%, ${-spot.fy * 100}%)`,
              maxWidth: node.goal && !small ? 260 : 180,
              opacity: isDim ? 0.3 : 1,
              transition: "opacity .25s",
              "--sm-delay": `${Math.max(0, (delays.current.get(node.id) ?? 0) + 0.25)}s`,
            } as CSSProperties}
          >
            {small ? (
              <span className={cx("font-mono font-medium", node.goal ? "text-brand-secondary" : "text-secondary")}>{node.goal ? "研究问题" : star.label}</span>
            ) : node.goal ? (
              <>
                <span className="block text-xs font-semibold text-brand-secondary">研究问题</span>
                <span className="mt-0.5 line-clamp-3 text-sm font-semibold text-primary">{selectionHeading(node.title, true)}</span>
              </>
            ) : (
              <>
                <span className={cx("line-clamp-2 leading-5 font-medium text-primary", node.status === "cancelled" && "text-tertiary line-through decoration-1")}>
                  <span className="mr-1.5 font-mono text-xs font-medium text-quaternary no-underline">{star.label}</span>
                  {node.title || "未命名任务"}
                </span>
                {live && (
                  <span className="mt-1 block truncate rounded-md bg-terminal px-1.5 py-0.5 font-mono text-xs text-terminal">
                    {live.tool === "思考" ? (
                      <span className="prism-shimmer text-white/40 [--shimmer-contrast:var(--color-terminal-fg)]">{live.hint || "正在想下一步"}</span>
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

      {tasks === 0 && size.w > 10 && <EmptyHint planning={running} />}
    </div>
  );
}

function EmptyHint({ planning }: { planning: boolean }) {
  return (
    <div data-ui className="pointer-events-none absolute inset-x-0 bottom-[22%] flex flex-col items-center gap-1 px-6 text-center">
      <p className={cx("text-md font-semibold text-primary", planning && "prism-shimmer")}>{planning ? "正在拆解研究问题" : "没有拆出任务"}</p>
      <p className="text-sm text-tertiary">{planning ? "智能体拆解问题后，任务会作为星点出现在这里。" : "这次研究没有留下可以展示的任务。"}</p>
    </div>
  );
}

