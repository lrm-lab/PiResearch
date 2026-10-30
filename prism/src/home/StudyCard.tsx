// One study as a CoForge card (rounded-xl, border-secondary, shadow-xs; hover deepens to shadow-md
// and lifts 1px). Top: the SVG star map of its thumbnail. Body: title, status badge, time and a
// thin progress bar in task-status colours. The whole card links to the study; a delete icon button
// appears on hover or focus. Running studies carry a slow border beam and a live dot.

import { memo, useCallback, useEffect, useRef, type Ref } from "react";
import { motion } from "motion/react";
import { Trash01 } from "@untitledui/icons";
import { prismStudyHref } from "../lib/api";
import { studyTone } from "../lib/status";
import type { HistoryRow, Thumbnail } from "../types/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ModelTag } from "../ui/ModelMark";
import { formatWhen, missingGraph, rowTitle, STATUS_LABEL, thumbStats } from "./format";
import { MiniMap } from "./MiniMap";
import { setThumbVisible } from "./polling";
import { useHome } from "./store";

export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
export const LAYOUT_SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.8 } as const;

/** Entrance, exit and layout motion shared by the study cards and the pending card. */
export function cardMotion(delay = 0) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.94, transition: { duration: 0.22, ease: EASE_OUT_QUINT } },
    transition: {
      layout: LAYOUT_SPRING,
      opacity: { duration: 0.4, delay },
      y: { duration: 0.5, delay, ease: EASE_OUT_QUINT },
    },
  } as const;
}

/** Map height from the node count: a dense study gets a taller picture, a thin one a short card. */
function mapHeight(nodes: number): number {
  return Math.max(120, Math.min(300, 104 + nodes * 11));
}

export const CARD_CLASS =
  "home-card group relative flex flex-col rounded-xl border border-secondary bg-primary shadow-xs transition-[box-shadow,translate,border-color] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-within:shadow-md dark:hover:border-brand-800";
export const BEAM_CLASS = "prism-beam [--beam-from:var(--color-status-progress)] [--beam-to:var(--color-brand-400)] [--beam-duration:7s] [--beam-width:1px]";

/** A pulsing dot for work in progress. */
export function LiveDot() {
  return (
    <span aria-hidden="true" className="relative flex size-1.5">
      <span className="absolute inset-0 animate-ping rounded-full bg-status-progress opacity-60 motion-reduce:animate-none" />
      <span className="relative size-1.5 rounded-full bg-status-progress" />
    </span>
  );
}

function counts(thumb: Thumbnail | undefined) {
  let cancelled = 0;
  if (thumb?.ok) for (const n of thumb.nodes ?? []) if (!n.goal && n.status === "cancelled") cancelled += 1;
  return cancelled;
}

function Progress({ thumb }: { thumb: Thumbnail | undefined }) {
  const stats = thumbStats(thumb);
  if (!stats || stats.tasks === 0) return null;
  const cancelled = counts(thumb);
  const pct = (n: number) => `${(n / stats.tasks) * 100}%`;
  return (
    <div className="flex items-center gap-2.5" title={`已完成 ${stats.resolved} / 共 ${stats.tasks} 项任务`}>
      <div className="flex h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-tertiary">
        <span className="bg-status-done transition-[width] duration-500 ease-[var(--ease-out-quint)]" style={{ width: pct(stats.resolved) }} />
        <span className="bg-status-progress transition-[width] duration-500 ease-[var(--ease-out-quint)]" style={{ width: pct(stats.active) }} />
        <span className="bg-status-closed transition-[width] duration-500 ease-[var(--ease-out-quint)]" style={{ width: pct(cancelled) }} />
      </div>
      <span className="shrink-0 font-mono text-xs text-tertiary tabular">
        {stats.resolved}/{stats.tasks}
      </span>
    </div>
  );
}

export const StudyCard = memo(function StudyCard({
  row,
  scroller,
  delay,
  featured = false,
  ref,
}: {
  row: HistoryRow;
  scroller: HTMLElement | null;
  delay: number;
  featured?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const thumb = useHome((state) => state.thumbs[row.id]);
  const openDelete = useHome((state) => state.openDelete);
  const cardRef = useRef<HTMLElement | null>(null);
  const running = row.status === "running";
  const title = rowTitle(row);
  const when = formatWhen(row.created_at);
  const noGraph = missingGraph(row) || (!running && !!thumb && !thumb.ok);

  // Thumbnails load (and live studies poll) only while the card is near the viewport.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      setThumbVisible(row.id, true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setThumbVisible(row.id, entry.isIntersecting);
      },
      { root: scroller, rootMargin: "240px 0px" },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      setThumbVisible(row.id, false);
    };
  }, [row.id, scroller]);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      cardRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLElement | null }).current = node;
    },
    [ref],
  );

  return (
    <motion.article ref={setRef} layout="position" data-study-card {...cardMotion(delay)} className={cx(CARD_CLASS, running && BEAM_CLASS, featured && "home-featured")}>
      <a
        href={prismStudyHref(row.id)}
        data-study-link
        data-id={row.id}
        className="flex min-h-0 flex-1 flex-col rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="home-card-map overflow-hidden rounded-t-[11px] border-b border-secondary" style={{ height: mapHeight(thumb?.nodes?.length ?? 0) }}>
          <MiniMap thumb={thumb} running={running} noGraph={noGraph} />
        </div>
        <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
          <h3 className="line-clamp-2 min-h-12 text-md font-semibold text-primary" title={title}>
            {title}
          </h3>
          <div className="mt-auto flex min-w-0 flex-col gap-3 pt-3">
            <Progress thumb={thumb} />
            <div className="flex min-w-0 items-center gap-2">
              <span title={row.status === "failed" && row.error ? row.error : undefined}>
                <Badge color={studyTone(row.status)} dot={!running} size="xs">
                  {running && <LiveDot />}
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              </span>
              <ModelTag id={row.model} />
              {when && <span className="ml-auto shrink-0 font-mono text-xs text-tertiary tabular">{when}</span>}
            </div>
          </div>
        </div>
      </a>
      <div className="absolute top-2.5 right-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <Button
          color="tertiary-destructive"
          size="xs"
          iconLeading={Trash01}
          aria-label={`删除研究：${title}`}
          title="删除研究"
          onClick={(event) => openDelete(row, event.currentTarget)}
          className="bg-primary/90 shadow-xs ring-1 ring-secondary backdrop-blur-sm ring-inset"
        />
      </div>
    </motion.article>
  );
});
