// One study as a CoForge card (rounded-xl, border-secondary, shadow-xs; hover lifts with a spring
// and deepens to shadow-md). The top is a live 3D mini-diorama drawn by the shared canvas behind
// the page (this element stays transparent and only reserves the rect); below sit the title, the
// status badge, task progress and the time. The whole card links to the study; a delete icon
// button appears on hover or focus. Running studies carry the border beam.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { motion } from "motion/react";
import { Trash01 } from "@untitledui/icons";
import { prismStudyHref } from "../lib/api";
import { studyTone } from "../lib/status";
import type { HistoryRow } from "../types/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { formatWhen, missingGraph, rowTitle, STATUS_LABEL, thumbStats } from "./format";
import { FlatMini } from "./minis/FlatMini";
import { registerMini, snapshotMini } from "./minis/registry";
import { setThumbVisible } from "./polling";
import { useHome } from "./store";

export const CARD_SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 } as const;
/** View-transition name the study page can pick up for its scene (one element per document). */
export const DIORAMA_TRANSITION = "prism-diorama";

const freezers = new Map<string, () => void>();

/** Replace a card's live mini with a still copy (before it dissolves or the page leaves). */
export function freezeCard(id: string): void {
  freezers.get(id)?.();
}

const supportsViewTransitions = typeof document !== "undefined" && "startViewTransition" in document;

export const StudyCard = memo(function StudyCard({
  row,
  webgl,
  scroller,
}: {
  row: HistoryRow;
  webgl: boolean;
  scroller: HTMLElement | null;
}) {
  const thumb = useHome((state) => state.thumbs[row.id]);
  const cardRef = useRef<HTMLElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const stillRef = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState<HTMLCanvasElement | "blank" | null>(null);
  const running = row.status === "running";
  const stats = thumbStats(thumb);
  const title = rowTitle(row);
  const when = formatWhen(row.created_at);
  const waiting = running && thumb && !thumb.ok;
  const noGraph = missingGraph(row) || (!running && thumb && !thumb.ok);

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

  // The shared canvas draws this card's mini while it is live (not frozen).
  useEffect(() => {
    const mini = miniRef.current;
    if (!webgl || still || !mini) return;
    return registerMini(row.id, mini);
  }, [row.id, webgl, still]);

  // Frozen: show the still copy inside the card, so DOM effects (blur, mask, view transitions)
  // apply to the picture too.
  useLayoutEffect(() => {
    const host = stillRef.current;
    if (!host) return;
    host.replaceChildren(...(still instanceof HTMLCanvasElement ? [still] : []));
  }, [still]);

  useEffect(() => {
    freezers.set(row.id, () => {
      const mini = miniRef.current;
      if (!webgl || !mini) return;
      const copy = snapshotMini(mini);
      flushSync(() => setStill(copy ?? "blank"));
    });
    return () => {
      freezers.delete(row.id);
    };
  }, [row.id, webgl]);

  // Back through the bfcache: live again.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setStill(null);
      if (miniRef.current) miniRef.current.style.viewTransitionName = "";
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const onOpen = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!supportsViewTransitions) return;
      freezeCard(row.id);
      for (const named of document.querySelectorAll<HTMLElement>("[data-mini]")) named.style.viewTransitionName = "";
      if (miniRef.current) miniRef.current.style.viewTransitionName = DIORAMA_TRANSITION;
    },
    [row.id],
  );

  const hover = useHome((state) => state.hover);
  const unhover = useHome((state) => state.unhover);
  const openDelete = useHome((state) => state.openDelete);

  return (
    <motion.article
      ref={cardRef}
      layout
      data-study-card
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        scale: 0.9,
        filter: "blur(10px)",
        // Dissolve from the edges inward (keyframes: the card has no mask at rest, which would
        // clip its shadow).
        maskImage: [
          "radial-gradient(circle at 50% 45%, black 100%, transparent 140%)",
          "radial-gradient(circle at 50% 45%, black 0%, transparent 38%)",
        ],
        transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      }}
      whileHover={{ y: -3 }}
      transition={CARD_SPRING}
      onPointerEnter={() => hover(row.id)}
      onPointerLeave={() => unhover(row.id)}
      onFocus={() => hover(row.id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) unhover(row.id);
      }}
      className={cx(
        "group relative rounded-xl border border-secondary shadow-xs transition-shadow duration-200 hover:shadow-md focus-within:shadow-md",
        running && "prism-beam [--beam-from:var(--color-status-progress)] [--beam-to:var(--color-brand-400)] [--beam-duration:5s]",
      )}
    >
      <a
        href={prismStudyHref(row.id)}
        data-study-link
        data-id={row.id}
        onClick={onOpen}
        className="block rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div ref={miniRef} data-mini className="relative aspect-[16/10] overflow-hidden rounded-t-[11px]">
          {!webgl && <FlatMini thumb={thumb} />}
          <div ref={stillRef} aria-hidden="true" className="absolute inset-0 [&>canvas]:size-full" />
          {(waiting || noGraph) && (
            <p className="absolute inset-x-0 bottom-3 text-center text-xs text-tertiary">
              {waiting ? <span className="prism-shimmer">正在等待派发任务</span> : "没有任务图"}
            </p>
          )}
        </div>
        <div className="rounded-b-[11px] border-t border-secondary bg-primary p-4">
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-primary" title={title}>
            {title}
          </h3>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <span title={row.status === "failed" && row.error ? row.error : undefined}>
              <Badge color={studyTone(row.status)} dot size="xs">
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
            </span>
            {stats && stats.tasks > 0 && (
              <span className="font-mono text-xs text-tertiary tabular" title={`已完成 ${stats.resolved} / 共 ${stats.tasks} 项任务`}>
                {stats.resolved}/{stats.tasks}
              </span>
            )}
            {when && <span className="ml-auto shrink-0 font-mono text-xs text-quaternary tabular">{when}</span>}
          </div>
        </div>
      </a>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <Button
          color="tertiary-destructive"
          size="xs"
          iconLeading={Trash01}
          aria-label={`删除研究：${title}`}
          title="删除研究"
          onClick={(event) => openDelete(row, event.currentTarget)}
          className="bg-primary/85 shadow-xs backdrop-blur-sm"
        />
      </div>
    </motion.article>
  );
});
