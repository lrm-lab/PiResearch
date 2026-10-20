// Delete confirmation (constellation/home.html:509-588): role=dialog
// aria-modal, Tab focus trap, Escape / backdrop cancel, running-study copy,
// 保留研究 / 永久删除 (正在删除… while pending), inline errors.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DELETE_NOTE_DONE, DELETE_NOTE_RUNNING, rowTitle } from "./format";
import { deleteStudy } from "./mutations";
import { refreshHistoryNow } from "./polling";
import { useHome } from "./store";

export function DeleteDialog() {
  const target = useHome((state) => state.deleteTarget);
  if (!target) return null;
  return <Dialog key={target.row.id} />;
}

function Dialog() {
  const target = useHome((state) => state.deleteTarget)!;
  const close = useHome((state) => state.closeDelete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const { row, opener } = target;

  useEffect(() => {
    stayRef.current?.focus();
    document.body.classList.add("home-confirm-open");
    return () => document.body.classList.remove("home-confirm-open");
  }, []);

  function finish(restoreFocus: boolean) {
    close();
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  // Escape anywhere cancels (unless the request is in flight).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!busy) finish(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    if (busy) {
      yesRef.current?.focus();
      return;
    }
    const nodes = [stayRef.current, yesRef.current].filter(Boolean) as HTMLButtonElement[];
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStudy(row.id);
      // The opener goes away with the study: move focus to a neighbour.
      const links = [...document.querySelectorAll<HTMLElement>("[data-study-link]")];
      const index = links.findIndex((link) => link.dataset.id === row.id);
      const next = links[index + 1] ?? links[index - 1] ?? document.querySelector<HTMLElement>(".home-composer-input");
      close();
      next?.focus({ preventScroll: true });
      useHome.getState().beginRemove(row.id);
      refreshHistoryNow();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
      stayRef.current?.focus();
    }
  }

  return (
    <div
      className="home-veil"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) finish(true);
      }}
    >
      <div
        className="home-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-forget-title"
        aria-describedby="home-forget-note"
        onKeyDown={onKeyDown}
      >
        <span className="home-confirm-symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4.5 6.5h15M9 6.5V4.7c0-.7.6-1.2 1.3-1.2h3.4c.7 0 1.3.5 1.3 1.2v1.8m-8.9 0 .8 12.1c.1 1 .8 1.7 1.8 1.7h6.6c1 0 1.7-.7 1.8-1.7l.8-12.1M10 10v6.5m4-6.5v6.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 id="home-forget-title" className="home-confirm-title">
          确认删除这项研究？
        </h2>
        <p id="home-forget-note" className="home-confirm-note">
          {row.status === "running" ? DELETE_NOTE_RUNNING : DELETE_NOTE_DONE}
        </p>
        <div className="home-confirm-which">
          <span>将删除</span>
          <p>{rowTitle(row) || "这项研究"}</p>
        </div>
        {error && (
          <p className="home-confirm-error" role="alert">
            {error}
          </p>
        )}
        <div className="home-confirm-actions">
          <button ref={stayRef} type="button" className="home-btn home-btn-stay" disabled={busy} onClick={() => finish(true)}>
            保留研究
          </button>
          <button
            ref={yesRef}
            type="button"
            className="home-btn home-btn-danger"
            aria-disabled={busy ? true : undefined}
            onClick={confirm}
          >
            {busy ? "正在删除…" : "永久删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
