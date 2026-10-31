// 继续调研: the draft card at the end of the thread. It waits for the main agent's draft (shimmer +
// orb), types it into an editable textarea, then starts the study. Starting fires a prism ripple
// and hands the card's rect to the spawn animation; the card turns into a success row.

import { ArrowRight, Check, GitBranch01, RefreshCw01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModelChip } from "../../home/ModelSettings";
import { prismStudyHref } from "../../lib/api";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { useStudy } from "../store";
import { AgentAvatar } from "../../ui/AgentAvatar";
import type { ReportChat } from "./useReportChat";

const RIPPLE = ["#8f6ff2", "#22d3ee", "#f472b6"] as const;

/** The draft, typed in character by character; editable once it has landed. */
function DraftEditor({ initial, disabled, onChange }: { initial: string; disabled: boolean; onChange: (text: string) => void }) {
  const reduced = useStudy((s) => s.reducedMotion);
  const [value, setValue] = useState(initial);
  const [shown, setShown] = useState(reduced ? initial.length : 0);
  const typing = shown < initial.length;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!typing) return;
    const step = Math.max(1, Math.ceil(initial.length / 90));
    const timer = window.setInterval(() => setShown((n) => Math.min(initial.length, n + step)), 22);
    return () => window.clearInterval(timer);
  }, [typing, initial.length]);

  const text = typing ? initial.slice(0, shown) : value;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  return (
    <textarea
      ref={ref}
      value={text}
      readOnly={typing}
      disabled={disabled}
      rows={3}
      aria-label="继续调研"
      onClick={() => typing && setShown(initial.length)}
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
      className={cx(
        "block w-full resize-none rounded-lg bg-secondary px-3 py-2.5 text-sm leading-6 text-primary outline-none ring-1 ring-border-secondary ring-inset transition-shadow focus:ring-2 focus:ring-fg-brand-primary disabled:opacity-70",
        typing && "caret-transparent",
      )}
    />
  );
}

export function DraftCard({ chat, onSpawn }: { chat: ReportChat; onSpawn: (from: DOMRect, id: string) => void }) {
  const { draft } = chat;
  const cardRef = useRef<HTMLDivElement>(null);
  const [ripple, setRipple] = useState(0);
  if (!draft) return null;

  const start = async () => {
    const rect = cardRef.current?.getBoundingClientRect();
    const started = await chat.startDraft();
    if (!started || !rect) return;
    setRipple((n) => n + 1);
    onSpawn(rect, started.id);
  };

  const loading = draft.phase === "loading";
  const failed = draft.phase === "ready" && !draft.text && draft.error;

  return (
    <motion.div
      ref={cardRef}
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="relative"
    >
      <AnimatePresence>
        {ripple > 0 &&
          RIPPLE.map((color, index) => (
            <motion.span
              key={`${ripple}-${color}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl border-2"
              style={{ borderColor: color, boxShadow: `0 0 18px ${color}88` }}
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.14 + index * 0.05 }}
              transition={{ duration: 0.85, delay: index * 0.1, ease: "easeOut" }}
            />
          ))}
      </AnimatePresence>
      {draft.phase === "started" && draft.started ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="flex items-center gap-2.5 rounded-xl bg-success-primary px-3.5 py-3 ring-1 ring-[color-mix(in_srgb,var(--color-fg-success-primary)_28%,transparent)] ring-inset"
        >
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-fg-success-primary)] text-white">
            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
          </span>
          <span className="flex-1 text-sm font-semibold text-success-primary">新研究已开始</span>
          <a
            href={prismStudyHref(draft.started.id)}
            className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-brand-secondary outline-none hover:text-brand-tertiary focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            前往 <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </motion.div>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-primary p-3 shadow-sm ring-1 ring-border-primary ring-inset">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#8f6ff2,#22d3ee,#f472b6,#fbbf24)]" />
          {loading ? (
            <div role="status" className="flex flex-col gap-3 py-1">
              <div className="flex items-center gap-2.5">
                <AgentAvatar name="主 agent" seed="main" mood="puzzled" className="size-6" />
                <span className="prism-shimmer ml-1.5 text-sm font-medium text-tertiary">整理中…</span>
              </div>
              <div className="space-y-2" aria-hidden="true">
                <div className="h-3 w-full animate-pulse rounded bg-tertiary" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-tertiary" />
              </div>
            </div>
          ) : failed ? (
            <div className="flex items-center gap-2">
              <GitBranch01 aria-hidden="true" className="size-4 shrink-0 text-fg-quaternary" />
              <p role="alert" className="flex-1 text-sm text-error-primary">
                {draft.error}
              </p>
              <Button color="tertiary" size="sm" iconLeading={RefreshCw01} aria-label="重试" onClick={() => void chat.draftFollowup("")} />
              <Button color="secondary" size="sm" onClick={chat.cancelDraft}>
                取消
              </Button>
            </div>
          ) : (
            <>
              <DraftEditor initial={draft.text} disabled={draft.phase === "starting"} onChange={chat.editDraft} />
              {draft.error && (
                <p role="alert" className="mt-2 text-xs text-error-primary">
                  {draft.error}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-2">
                <ModelChip disabled={draft.phase === "starting"} side="top" />
                <span className="flex-1" />
                <Button color="tertiary" size="xs" onClick={chat.cancelDraft} disabled={draft.phase === "starting"}>
                  取消
                </Button>
                <Button
                  color="primary"
                  size="xs"
                  iconLeading={GitBranch01}
                  isLoading={draft.phase === "starting"}
                  disabled={!draft.text.trim()}
                  onClick={() => void start()}
                >
                  开始调研
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
