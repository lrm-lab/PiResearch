// Delete confirmation (constellation/home.html:509-588): role=dialog
// aria-modal, Tab focus trap, Escape / backdrop cancel, running-study copy,
// 保留研究 / 永久删除 (正在删除… while pending), inline errors.

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/hooks";
import { IconTrash } from "../ui/icons";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const { row, opener } = target;
  // While busy, 保留研究 is disabled, so Tab stays on 永久删除.
  useFocusTrap(dialogRef, true);

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
        ref={dialogRef}
        className="home-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-forget-title"
        aria-describedby="home-forget-note"
      >
        <span className="home-confirm-symbol" aria-hidden="true">
          <IconTrash lines />
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
