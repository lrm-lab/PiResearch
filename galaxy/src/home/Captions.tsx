// DOM layer over the scene: one caption per study (a real, focusable link
// plus a delete control), the section headings and the empty notes. The scene
// positions them every frame (motion.ts registries); DOM order is the Tab order.

import { memo, useCallback, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { galaxyStudyHref } from "../lib/api";
import type { HistoryRow } from "../types/api";
import { IconTrash } from "../ui/icons";
import { ModelTag } from "../ui/ModelMark";
import { captionLine, rowTitle, splitRows, thumbStats } from "./format";
import { galleryLines, neighbour, type ArrowKey } from "./layout";
import { emptyEls, gallery, registerCaption, rowLabelEls } from "./motion";
import { useHome } from "./store";

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export function Captions() {
  const rows = useHome((state) => state.rows);
  const split = useMemo(() => splitRows(rows ?? []), [rows]);
  const ids = useMemo<[string[], string[]]>(() => [split.running.map((r) => r.id), split.done.map((r) => r.id)], [split]);
  const firstRun = rows !== null && rows.length === 0;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!ARROWS.has(event.key)) return;
      const target = event.target as HTMLElement;
      const id = target.closest<HTMLElement>("[data-study]")?.dataset.study;
      if (!id) return;
      // Lines as currently laid out (the column count follows the viewport).
      const next = neighbour(galleryLines(ids, gallery.layout.cols), id, event.key as ArrowKey);
      event.preventDefault();
      if (!next) return;
      const link = document.querySelector<HTMLElement>(`[data-study-link][data-id="${CSS.escape(next)}"]`);
      link?.focus({ preventScroll: true });
    },
    [ids],
  );

  const items = [
    ...split.running.map((row) => <Caption key={row.id} row={row} />),
    ...split.done.map((row) => <Caption key={row.id} row={row} />),
  ];

  return (
    <div className="home-captions" onKeyDown={onKeyDown}>
      <h2 ref={(el) => void (rowLabelEls[0] = el)} className={`home-row-label${firstRun ? " sr-only" : ""}`}>
        <span className="home-row-dot is-live" aria-hidden="true" />
        调研中
        <span className="home-row-count">{split.running.length}</span>
      </h2>
      <h2 ref={(el) => void (rowLabelEls[1] = el)} className={`home-row-label${firstRun ? " sr-only" : ""}`}>
        <span className="home-row-dot" aria-hidden="true" />
        已完成
        <span className="home-row-count">{split.done.length}</span>
      </h2>
      {rows !== null && split.running.length === 0 && (
        <p ref={(el) => void (emptyEls[0] = el)} className={`home-empty${firstRun ? " sr-only" : ""}`}>
          没有正在进行的研究。
        </p>
      )}
      {rows !== null && split.done.length === 0 && (
        <p ref={(el) => void (emptyEls[1] = el)} className={`home-empty${firstRun ? " sr-only" : ""}`}>
          还没有完成的研究。
        </p>
      )}
      <ul className="home-caption-list" aria-label="研究星系">
        {items}
      </ul>
    </div>
  );
}

const Caption = memo(function Caption({ row }: { row: HistoryRow }) {
  const id = row.id;
  const active = useHome((state) => !state.launch && (state.hovered === id || state.focused === id));
  const thumb = useHome((state) => state.thumbs[id]);
  const removing = useHome((state) => Boolean(state.removing[id]));
  const stats = thumbStats(thumb);
  const title = rowTitle(row);
  const line = captionLine(row);
  const href = galaxyStudyHref(id);

  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (gallery.dragged) {
        event.preventDefault();
        return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const store = useHome.getState();
      if (store.reducedMotion || !store.sceneReady) return;
      event.preventDefault();
      store.fly({ id, href });
    },
    [href, id],
  );

  const ref = useCallback((element: HTMLLIElement | null) => registerCaption(id, element), [id]);

  return (
    <li
      ref={ref}
      className={`home-cap is-${row.status}${active ? " is-active" : ""}${removing ? " is-removing" : ""}`}
      data-study={id}
      style={{ opacity: 0 }}
    >
      <a
        href={href}
        className="home-cap-link"
        data-study-link=""
        data-id={id}
        draggable={false}
        aria-label={`${title}，${line}`}
        onClick={onClick}
        onFocus={() => useHome.getState().focus(id)}
        onBlur={() => {
          if (useHome.getState().focused === id) useHome.getState().focus(null);
        }}
        onMouseEnter={() => !gallery.dragging && useHome.getState().hover(id)}
        onMouseLeave={() => useHome.getState().unhover(id)}
      >
        <span className="home-cap-meta">
          <span className="home-cap-dot" aria-hidden="true" />
          {line}
          <ModelTag id={row.model} />
        </span>
        <span className="home-cap-title">{title}</span>
        <span className="home-cap-more" aria-hidden="true">
          {stats ? (
            <>
              <span>{stats.tasks} 项任务</span>
              <span className="home-cap-bar">
                <i style={{ width: `${stats.tasks ? Math.round((stats.resolved / stats.tasks) * 100) : 0}%` }} />
              </span>
              <span>已完成 {stats.resolved}</span>
            </>
          ) : (
            <span>{row.status === "running" ? "星图正在形成" : "没有星图"}</span>
          )}
          <span className="home-cap-enter">进入星系 →</span>
        </span>
      </a>
      <button
        type="button"
        className="home-cap-trash"
        aria-label={`删除研究：${title}`}
        title="删除研究"
        onFocus={() => useHome.getState().focus(id)}
        onBlur={() => {
          if (useHome.getState().focused === id) useHome.getState().focus(null);
        }}
        onClick={(event) => useHome.getState().openDelete(row, event.currentTarget)}
      >
        <IconTrash />
      </button>
    </li>
  );
});
