// CoForge-style delete confirmation (docs/design/color-status-typography.md, 危险操作): a featured
// icon and a grey description instead of a red warning box, `secondary` cancel and the one solid
// red `primary-destructive` confirm with a loading state. role=dialog aria-modal, Tab trapped,
// Esc or the backdrop cancels (not while the request is out), focus returns to the opener. On
// success the card freezes its mini, then dissolves out of the grid and the grid reflows.

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Trash01 } from "@untitledui/icons";
import { useFocusTrap } from "../lib/hooks";
import { Button } from "../ui/Button";
import { DELETE_NOTE_DONE, DELETE_NOTE_RUNNING, rowTitle } from "./format";
import { deleteStudy } from "./mutations";
import { refreshHistoryNow } from "./polling";
import { useHome } from "./store";
import { freezeCard } from "./StudyCard";

const EXIT_MS = 160;

export function DeleteDialog() {
  const target = useHome((state) => state.deleteTarget);
  return createPortal(<AnimatePresence>{target && <Dialog key={target.row.id} />}</AnimatePresence>, document.body);
}

function Dialog() {
  const close = useHome((state) => state.closeDelete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Keep the row: the target is cleared on close while the exit animation still renders.
  const [{ row, opener }] = useState(() => useHome.getState().deleteTarget!);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  function cancel() {
    if (busy) return;
    close();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Both buttons are disabled while the request is out: keep focus inside the dialog.
    dialogRef.current?.focus({ preventScroll: true });
    try {
      await deleteStudy(row.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      // Re-enable first, then focus 取消 once it is no longer disabled.
      flushSync(() => setBusy(false));
      cancelRef.current?.focus({ preventScroll: true });
      return;
    }
    // The opener leaves with the card: focus a neighbouring card, else the composer.
    const links = [...document.querySelectorAll<HTMLElement>("[data-study-link]")];
    const index = links.findIndex((link) => link.dataset.id === row.id);
    const next = links[index + 1] ?? links[index - 1] ?? document.querySelector<HTMLElement>("textarea[name=question]");
    close();
    next?.focus({ preventScroll: true });
    // Let the veil clear first, so the dissolve is seen.
    setTimeout(() => {
      freezeCard(row.id);
      useHome.getState().remove(row.id);
      refreshHistoryNow();
    }, EXIT_MS + 20);
  }

  const title = rowTitle(row) || "这项研究";
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-4 sm:items-center sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: EXIT_MS / 1000 } }}
      transition={{ duration: 0.18 }}
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-overlay/70 backdrop-blur-[6px]"
        onMouseDown={cancel}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-delete-title"
        aria-describedby="home-delete-note"
        tabIndex={-1}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: EXIT_MS / 1000, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="relative w-full max-w-100 rounded-2xl outline-none bg-primary p-6 shadow-xl ring-1 ring-secondary"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-error-primary text-fg-error-primary ring-8 ring-[color-mix(in_srgb,var(--color-bg-error-primary)_55%,transparent)]">
          <Trash01 aria-hidden="true" className="size-6" />
        </div>
        <h2 id="home-delete-title" className="mt-4 text-lg font-semibold text-primary">
          删除这项研究？
        </h2>
        <p id="home-delete-note" className="mt-1 text-sm text-tertiary">
          {row.status === "running" ? DELETE_NOTE_RUNNING : DELETE_NOTE_DONE}
        </p>
        <p className="mt-4 line-clamp-3 rounded-lg bg-secondary px-3 py-2.5 text-sm font-medium text-secondary ring-1 ring-secondary ring-inset">
          {title}
        </p>
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-1.5 overflow-hidden text-sm text-error-primary"
            >
              <AlertCircle aria-hidden="true" className="mt-3.5 size-4 shrink-0" />
              <span className="pt-3">{error}</span>
            </motion.p>
          )}
        </AnimatePresence>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button ref={cancelRef} color="secondary" disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button color="primary-destructive" isLoading={busy} showTextWhileLoading onClick={confirm}>
            {busy ? "正在删除" : "删除"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
