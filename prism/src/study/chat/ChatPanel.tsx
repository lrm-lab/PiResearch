// The chat panel: header, thread (messages, the turn in flight, the follow-up draft) and composer.

import { ArrowUp, ChevronDown, ChevronRight, GitBranch01, RefreshCw01, Trash01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ModelTag } from "../../ui/ModelMark";
import { cx } from "../../ui/cx";
import type { ChatMessage } from "../../types/api";
import { Tooltip } from "../primitives";
import { AgentAvatar } from "../../ui/AgentAvatar";
import type { Mood } from "../../lib/mood";
import { DraftCard } from "./DraftCard";
import type { ReportChat } from "./useReportChat";

const ChatMarkdown = lazy(() => import("./ChatMarkdown"));

export const SHELL_ID = "report-chat-shell";
export const SHELL_SPRING = { type: "spring", stiffness: 380, damping: 36, mass: 0.9 } as const;

const SUGGESTIONS = ["用三句话总结结论", "哪些结论证据最弱？", "下一步值得深挖什么？"] as const;
const MAX_COMPOSER = 144;

function splitQuote(content: string): { quote: string; body: string } {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith("> ")) i += 1;
  if (i === 0 || (lines[i] ?? "") !== "") return { quote: "", body: content };
  return { quote: lines.slice(0, i).map((l) => l.slice(2)).join("\n"), body: lines.slice(i + 1).join("\n") };
}

function UserBubble({ content }: { content: string }) {
  const { quote, body } = splitQuote(content);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 460, damping: 32 }}
      className="flex justify-end"
    >
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-solid px-3.5 py-2 text-sm leading-6 text-white shadow-xs">
        {quote && <p className="mb-1.5 line-clamp-3 border-l-2 border-white/50 pl-2 text-xs leading-5 whitespace-pre-line text-white/80">{quote}</p>}
        <p className="break-words whitespace-pre-wrap">{body}</p>
      </div>
    </motion.div>
  );
}

interface Cite {
  cited: (title: string) => boolean;
  onCite: (title: string) => void;
}

function Reply({ text, live, cite }: { text: string; live: boolean; cite: Cite }) {
  return (
    <Suspense fallback={<p className="text-sm text-tertiary">{text}</p>}>
      <ChatMarkdown text={text} live={live} cited={cite.cited} onCite={cite.onCite} />
    </Suspense>
  );
}

/** The main agent wears a CoForge mascot whose face tracks the conversation. */
function ChatMascot({ thinking, pulse, className }: { thinking?: boolean; pulse?: number; className?: string }) {
  const [happy, setHappy] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    setHappy(true);
    const timer = setTimeout(() => setHappy(false), 1600);
    return () => clearTimeout(timer);
  }, [pulse]);
  const mood: Mood = thinking ? "puzzled" : happy ? "happy" : "calm";
  return <AgentAvatar name="主 agent" seed="main" mood={mood} className={className} />;
}

function AssistantRow({ children, thinking = false, pulse = 0 }: { children?: ReactNode; thinking?: boolean; pulse?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="flex gap-2.5">
      <ChatMascot thinking={thinking} pulse={pulse} className="mt-0.5 size-6" />
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  );
}

function Message({ message, cite }: { message: ChatMessage; cite: Cite }) {
  return message.role === "user" ? (
    <UserBubble content={message.content} />
  ) : (
    <AssistantRow>
      <Reply text={message.content} live={false} cite={cite} />
    </AssistantRow>
  );
}

function EmptyThread({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-2 py-8">
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}>
        <ChatMascot className="size-16" />
      </motion.div>
      <div className="flex flex-col items-stretch gap-2">
        {SUGGESTIONS.map((text, index) => (
          <motion.button
            key={text}
            type="button"
            disabled={disabled}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 + index * 0.08, type: "spring", stiffness: 380, damping: 28 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPick(text)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-secondary shadow-xs ring-1 ring-border-primary outline-none ring-inset transition-colors hover:bg-brand-primary hover:text-brand-secondary hover:ring-fg-brand-primary/40 focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50"
          >
            {text}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  chat,
  sheet,
  modelId,
  cite,
  onCollapse,
  onSpawn,
}: {
  chat: ReportChat;
  sheet: boolean;
  modelId: unknown;
  cite: Cite;
  onCollapse: () => void;
  onSpawn: (from: DOMRect, id: string) => void;
}) {
  const { thread, turn, draft, quote, busy } = chat;
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const composing = useRef(false);
  const empty = thread.messages.length === 0 && !turn && !draft;

  // Follow the end of the thread unless the reader scrolled up.
  useEffect(() => {
    const box = scroller.current;
    const content = inner.current;
    if (!box || !content) return;
    const follow = () => {
      if (stick.current) box.scrollTop = box.scrollHeight;
    };
    const onScroll = () => {
      stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    box.addEventListener("scroll", onScroll, { passive: true });
    follow();
    return () => {
      observer.disconnect();
      box.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!confirm) return;
    const timer = window.setTimeout(() => setConfirm(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirm]);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER)}px`;
  }, [text]);

  useEffect(() => {
    const timer = window.setTimeout(() => field.current?.focus({ preventScroll: true }), 260);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (quote) field.current?.focus({ preventScroll: true });
  }, [quote]);

  const submit = (value = text) => {
    if (!value.trim() || busy) return;
    stick.current = true;
    void chat.send(value, quote);
    chat.setQuote(null);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const draftBusy = Boolean(draft && draft.phase !== "started");
  const CollapseIcon = sheet ? ChevronDown : ChevronRight;

  return (
    <motion.section
      layoutId={SHELL_ID}
      transition={SHELL_SPRING}
      aria-label="主 agent"
      style={{ borderRadius: 18 }}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary shadow-xl ring-1 ring-border-secondary"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.25 }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-secondary px-3.5">
          <ChatMascot thinking={Boolean(turn && turn.phase === "waiting")} pulse={chat.pulse} className="size-7" />
          <h2 className="text-sm font-semibold text-primary">主 agent</h2>
          <ModelTag id={modelId} />
          <span className="flex-1" />
          <AnimatePresence>
            {thread.messages.length > 0 && (
              <motion.span key="clear" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}>
                <Tooltip label="清空对话" side="bottom" align="end">
                  <button
                    type="button"
                    aria-label="清空对话"
                    onClick={() => {
                      if (confirm) {
                        setConfirm(false);
                        void chat.clear();
                      } else setConfirm(true);
                    }}
                    className={cx(
                      "inline-flex size-8 items-center justify-center rounded-lg outline-none transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring",
                      confirm ? "bg-error-primary text-error-primary" : "text-fg-quaternary hover:bg-primary_hover hover:text-fg-secondary",
                    )}
                  >
                    <Trash01 aria-hidden="true" className="size-4" />
                  </button>
                </Tooltip>
              </motion.span>
            )}
          </AnimatePresence>
          <Tooltip label="收起" side="bottom" align="end">
            <button
              type="button"
              aria-label="收起"
              aria-keyshortcuts="Escape"
              onClick={onCollapse}
              className="inline-flex size-8 items-center justify-center rounded-lg text-fg-quaternary outline-none transition-colors hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <CollapseIcon aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5">
          <div ref={inner} className={cx("flex flex-col gap-4 py-4", empty && "min-h-full py-0")}>
            {empty ? (
              <EmptyThread onPick={(value) => submit(value)} disabled={busy} />
            ) : (
              <>
                {thread.messages.map((message, index) => (
                  <Message key={`${index}-${message.at}`} message={message} cite={cite} />
                ))}
                {turn && (
                  <>
                    <UserBubble content={turn.user} />
                    <AssistantRow thinking={turn.phase === "waiting"}>
                      {turn.reply && <Reply text={turn.reply} live={turn.phase === "streaming"} cite={cite} />}
                      {turn.phase === "error" && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-primary px-3 py-2 text-sm text-error-primary">
                          <span className="flex-1">{turn.error}</span>
                          <button
                            type="button"
                            aria-label="重试"
                            onClick={chat.retry}
                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-focus-ring"
                          >
                            <RefreshCw01 aria-hidden="true" className="size-4" />
                          </button>
                        </div>
                      )}
                    </AssistantRow>
                  </>
                )}
                {draft && <DraftCard chat={chat} onSpawn={onSpawn} />}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3">
          <div className="rounded-2xl bg-primary shadow-xs ring-1 ring-border-primary transition-shadow focus-within:ring-2 focus-within:ring-fg-brand-primary">
            <AnimatePresence initial={false}>
              {quote && (
                <motion.div
                  key="quote"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="m-2 mb-0 flex items-start gap-2 rounded-lg bg-secondary py-1.5 pr-1.5 pl-2.5">
                    <span aria-hidden="true" className="mt-0.5 w-0.5 self-stretch rounded-full bg-fg-brand-primary" />
                    <p className="line-clamp-2 flex-1 text-xs leading-5 text-tertiary">{quote}</p>
                    <button
                      type="button"
                      aria-label="移除引用"
                      onClick={() => chat.setQuote(null)}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-quaternary outline-none hover:bg-tertiary hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
                    >
                      <XClose aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={field}
              value={text}
              rows={1}
              maxLength={4000}
              aria-label="问问主 agent…"
              placeholder="问问主 agent…"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={() => (composing.current = false)}
              className="block max-h-36 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm leading-6 text-primary outline-none placeholder:text-placeholder"
            />
            <div className="flex items-center gap-2 px-2 pb-2">
              <button
                type="button"
                disabled={draftBusy}
                onClick={() => {
                  stick.current = true;
                  void chat.draftFollowup(text);
                  setText("");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-secondary outline-none transition-colors hover:bg-brand-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <GitBranch01 aria-hidden="true" className="size-4" />
                继续调研
              </button>
              <span className="flex-1" />
              <motion.button
                type="button"
                aria-label="发送"
                disabled={!text.trim() || busy}
                onClick={() => submit()}
                whileTap={{ scale: 0.9 }}
                className="inline-flex size-8 items-center justify-center rounded-full bg-brand-solid text-white shadow-xs outline-none transition-opacity hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-35"
              >
                <ArrowUp aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}
