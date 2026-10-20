// No-WebGL fallback: a 2D card grid (4/3/2/1 columns) with SVG thumbnails,
// same captions, composer and delete. One flat keyed list so a card that
// changes group is moved, not remounted.

import { memo, useEffect, useId, useMemo, useRef } from "react";
import { galaxyStudyHref } from "../lib/api";
import { RELATION_COLOR, toneColor } from "../lib/palette";
import type { HistoryRow, Thumbnail } from "../types/api";
import { captionLine, rowTitle, splitRows, thumbFrame } from "./format";
import { setThumbVisible } from "./polling";
import { useHome } from "./store";

export function CardGrid() {
  const rows = useHome((state) => state.rows);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.study;
          if (id) setThumbVisible(id, entry.isIntersecting);
        }
      },
      { rootMargin: "200px" },
    );
    document.querySelectorAll<HTMLElement>(".home-card[data-study]").forEach((el) => observer.current?.observe(el));
    return () => observer.current?.disconnect();
  }, []);

  const items = [
    <h2 key="h-running" className="home-grid-heading">
      <span className="home-row-dot is-live" aria-hidden="true" />
      调研中 <span className="home-row-count">{split.running.length}</span>
    </h2>,
    ...(split.running.length
      ? split.running.map((row) => <Card key={row.id} row={row} observer={observer} />)
      : [
          <p key="e-running" className="home-grid-empty">
            没有正在进行的研究。
          </p>,
        ]),
    <h2 key="h-done" className="home-grid-heading">
      <span className="home-row-dot" aria-hidden="true" />
      已完成 <span className="home-row-count">{split.done.length}</span>
    </h2>,
    ...(split.done.length
      ? split.done.map((row) => <Card key={row.id} row={row} observer={observer} />)
      : [
          <p key="e-done" className="home-grid-empty">
            还没有完成的研究。
          </p>,
        ]),
  ];

  return (
    <main className="home-grid-wrap">
      <div className="home-grid">{items}</div>
    </main>
  );
}

const Card = memo(function Card({ row, observer }: { row: HistoryRow; observer: React.RefObject<IntersectionObserver | null> }) {
  const id = row.id;
  const thumb = useHome((state) => state.thumbs[id]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    observer.current?.observe(element);
    return () => {
      observer.current?.unobserve(element);
      setThumbVisible(id, false);
    };
  }, [id, observer]);
  const title = rowTitle(row);
  return (
    <div ref={ref} className={`home-card is-${row.status}`} data-study={id}>
      <a href={galaxyStudyHref(id)} className="home-card-link" data-study-link="" data-id={id}>
        <span className="home-card-thumb">
          <ThumbSvg thumb={thumb} />
        </span>
        <span className="home-card-caption">
          <span className="home-cap-meta">
            <span className="home-cap-dot" aria-hidden="true" />
            {captionLine(row)}
          </span>
          <span className="home-cap-title">{title}</span>
        </span>
      </a>
      <button
        type="button"
        className="home-cap-trash"
        aria-label={`删除研究：${title}`}
        title="删除研究"
        onClick={(event) => useHome.getState().openDelete(row, event.currentTarget)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 6.5h15M9 6.5V4.7c0-.7.6-1.2 1.3-1.2h3.4c.7 0 1.3.5 1.3 1.2v1.8m-8.9 0 .8 12.1c.1 1 .8 1.7 1.8 1.7h6.6c1 0 1.7-.7 1.8-1.7l.8-12.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
});

/** The 2D thumbnail (constellation/home.html `paint`), with a soft glow. */
function ThumbSvg({ thumb }: { thumb: Thumbnail | undefined }) {
  // useId() output contains characters that do not survive url(#…).
  const glowId = `home-thumb-glow-${useId().replace(/[^\w-]/g, "")}`;
  const nodes = thumb && thumb.ok ? thumb.nodes : [];
  if (!nodes.length) {
    return (
      <svg viewBox="0 0 300 200" aria-hidden="true">
        <circle cx="150" cy="100" r="10" fill="#9eb0c2" opacity=".5" />
      </svg>
    );
  }
  const frame = thumbFrame(nodes);
  const weight = frame.weight;
  const lone = nodes.length === 1 ? nodes[0]! : null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
    <svg viewBox={frame.viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {lone && (
        <>
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0" stopColor={toneColor(lone.tone)} stopOpacity={0.32} />
              <stop offset="1" stopColor={toneColor(lone.tone)} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={lone.x} cy={lone.y} r={frame.radii[0]! * 3.2} fill={`url(#${glowId})`} />
        </>
      )}
      {(thumb?.edges ?? []).map((edge, index) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const solid = edge.relation === "parent" || edge.relation === "support";
        return (
          <line
            key={index}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={RELATION_COLOR[edge.relation] ?? RELATION_COLOR.parent}
            strokeOpacity={0.55}
            strokeWidth={weight}
            strokeLinecap="round"
            strokeDasharray={solid ? undefined : `${weight * 1.4} ${weight * 2}`}
          />
        );
      })}
      {nodes.map((node, index) => (
        <circle key={node.id} cx={node.x} cy={node.y} r={frame.radii[index]} fill={toneColor(node.tone)} opacity={node.status === "open" ? 0.5 : 0.92} />
      ))}
    </svg>
  );
}
