// Talk with the study's main agent inside the report dialog, and branch a follow-up study off it.
// A floating ask bar morphs into a side panel (bottom sheet on phones); replies stream in and cite
// report sections as chips that scroll the report there; 继续调研 drafts a new question that, once
// started, flies off as a star into the header's lineage chips.

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Markdown, { type Components } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import { galaxyStudyHref } from "../lib/api";
import {
  CITE_PREFIX,
  clearChat,
  draftFollowup,
  fetchChat,
  findHeading,
  linkCitations,
  startFollowup,
  streamChat,
  withQuote,
  type ChatMessage,
  type ChatState,
} from "../lib/chat";
import { MODELS, setModelChoice, useModelChoice } from "../lib/model";
import { useGalaxy } from "../store";
import { IconChevronDown, IconClose, IconExternal, IconTrash } from "./icons";
import { ModelMark, ModelTag } from "./ModelMark";

const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];
const SUGGESTIONS = ["用三句话总结结论", "哪些结论证据最弱？", "下一步值得深挖什么？"];
const MIN_SELECTION = 4;

type Pending = { content: string; error?: string; text: string } | null;
type Draft =
  | { phase: "loading" }
  | { phase: "ready" | "starting"; question: string; error?: string }
  | { phase: "done"; href: string }
  | { phase: "failed"; error: string }
  | null;

export interface Spawn {
  from: DOMRect;
  key: number;
}

// -- state ------------------------------------------------------------------------

export function useReportChat(studyId: string | null) {
  const [info, setInfo] = useState<ChatState | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const [bump, setBump] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!studyId) return Promise.resolve();
      return fetchChat(studyId, signal)
        .then((next) => setInfo(next))
        .catch(() => {
          if (!signal?.aborted) setInfo((current) => current ?? { available: false, messages: [], parent: null, followups: [] });
        });
    },
    [studyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, [reload]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!studyId || !message || pending) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setPending({ text: message, content: "" });
      try {
        const reply = await streamChat(
          studyId,
          message,
          { onDelta: (delta) => setPending((current) => (current ? { ...current, content: current.content + delta } : current)) },
          controller.signal,
        );
        setInfo((current) => current && { ...current, messages: [...current.messages, { role: "user", content: message }, reply] });
        setPending(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPending((current) => current && { ...current, error: (error as Error).message });
      }
    },
    [pending, studyId],
  );

  const clear = useCallback(async () => {
    if (!studyId) return;
    abort.current?.abort();
    setPending(null);
    setInfo((current) => current && { ...current, messages: [] });
    await clearChat(studyId).catch(() => undefined);
  }, [studyId]);

  const beginDraft = useCallback(
    async (hint: string) => {
      if (!studyId) return;
      setDraft({ phase: "loading" });
      try {
        const question = await draftFollowup(studyId, hint.trim());
        setDraft({ phase: "ready", question });
      } catch (error) {
        setDraft({ phase: "failed", error: (error as Error).message });
      }
    },
    [studyId],
  );

  const start = useCallback(
    async (question: string, model: string, from: DOMRect | null) => {
      if (!studyId) return;
      setDraft({ phase: "starting", question });
      try {
        const created = await startFollowup(studyId, question, model);
        setDraft({ phase: "done", href: created.id ? galaxyStudyHref(created.id) : created.href });
        if (from) setSpawn({ from, key: Date.now() });
        await reload();
        setBump((value) => value + 1);
      } catch (error) {
        setDraft({ phase: "ready", question, error: (error as Error).message });
      }
    },
    [reload, studyId],
  );

  return { info, pending, draft, setDraft, spawn, setSpawn, bump, send, clear, beginDraft, start, dismissError: () => setPending(null) };
}

export type ReportChatApi = ReturnType<typeof useReportChat>;

// -- the agent's orb ------------------------------------------------------------------

export function AgentOrb({ size = "md", thinking = false, pulse = 0 }: { size?: "sm" | "md" | "lg"; thinking?: boolean; pulse?: number }) {
  return (
    <span className={`agent-orb is-${size}${thinking ? " is-thinking" : ""}`} aria-hidden="true">
      <span className="agent-orb-core" />
      <span className="agent-orb-ring" />
      {thinking && (
        <span className="agent-orb-motes">
          <i />
          <i />
          <i />
        </span>
      )}
      {pulse > 0 && <span key={pulse} className="agent-orb-pulse" />}
    </span>
  );
}

function IconFork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <path d="M6 7.2v9.6M18 9.2c0 4.2-5 3.6-10.4 8" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}

// -- ask bar --------------------------------------------------------------------------

export function AskBar({ onOpen, onFollowup }: { onOpen: () => void; onFollowup: () => void }) {
  return (
    <motion.div layoutId="report-chat-shell" className="chat-askbar" transition={SPRING} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" className="chat-askbar-open" onClick={onOpen}>
        <AgentOrb size="md" />
        <span className="chat-askbar-text">问问主 agent…</span>
      </button>
      <button type="button" className="chat-askbar-fork" onClick={onFollowup} title="继续调研" aria-label="继续调研">
        <IconFork />
      </button>
    </motion.div>
  );
}

// -- selection → 问这段 ------------------------------------------------------------------

export function SelectionAsk({ scrollRef, onAsk }: { scrollRef: RefObject<HTMLDivElement | null>; onAsk: (quote: string) => void }) {
  const [spot, setSpot] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const read = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || selection.rangeCount === 0 || text.length < MIN_SELECTION) return setSpot(null);
      const range = selection.getRangeAt(0);
      if (!scroller.querySelector(".prose-report")?.contains(range.commonAncestorContainer)) return setSpot(null);
      const rect = range.getBoundingClientRect();
      setSpot({ x: rect.left + rect.width / 2, y: rect.top, text });
    };
    const onUp = () => requestAnimationFrame(read);
    const onScroll = () => setSpot(null);
    scroller.addEventListener("pointerup", onUp);
    scroller.addEventListener("keyup", onUp);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("pointerup", onUp);
      scroller.removeEventListener("keyup", onUp);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef]);

  return createPortal(
    <AnimatePresence>
      {spot && (
        <motion.button
          key={`${Math.round(spot.x)}:${Math.round(spot.y)}`}
          type="button"
          className="chat-quote-ask"
          style={{ left: spot.x, top: spot.y }}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
          transition={SPRING}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onAsk(spot.text);
            window.getSelection()?.removeAllRanges();
            setSpot(null);
          }}
        >
          <AgentOrb size="sm" />
          问这段
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// -- markdown with citation chips ----------------------------------------------------------

const CiteContext = createContext<(title: string) => boolean>(() => false);

const CHAT_COMPONENTS: Components = {
  a({ node: _node, href, children, ...rest }) {
    if (href?.startsWith(CITE_PREFIX)) return <CiteChip title={decodeURIComponent(href.slice(CITE_PREFIX.length))} />;
    return (
      <a href={href} {...rest} target="_blank" rel="noopener noreferrer">
        {children}
        <IconExternal className="ext" />
      </a>
    );
  },
  table({ node: _node, children, ...rest }) {
    return (
      <div className="chat-table g-scroll">
        <table {...rest}>{children}</table>
      </div>
    );
  },
};

function CiteChip({ title }: { title: string }) {
  const cite = useContext(CiteContext);
  const [missing, setMissing] = useState(false);
  const short = title.length > 18 ? `${title.slice(0, 17)}…` : title;
  return (
    <button type="button" className={`chat-cite${missing ? " is-missing" : ""}`} title={title} onClick={() => setMissing(!cite(title))}>
      <span aria-hidden="true">§</span>
      {short}
    </button>
  );
}

function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={CHAT_COMPONENTS}>
        {linkCitations(text)}
      </Markdown>
    </div>
  );
}

/** Scroll the report to a cited heading and sweep a highlight across it. */
export function useCite(scrollRef: RefObject<HTMLDivElement | null>) {
  return useCallback(
    (title: string) => {
      const headings = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>(".prose-report :is(h1,h2,h3,h4)") ?? []);
      const heading = findHeading(headings, title);
      if (!heading) return false;
      heading.scrollIntoView({ block: "start", behavior: useGalaxy.getState().reducedMotion ? "auto" : "smooth" });
      heading.classList.remove("is-cited");
      void heading.offsetWidth;
      heading.classList.add("is-cited");
      window.setTimeout(() => heading.classList.remove("is-cited"), 1800);
      return true;
    },
    [scrollRef],
  );
}

// -- panel ------------------------------------------------------------------------------

export function ChatPanel({
  chat,
  model,
  quote,
  setQuote,
  focusKey,
  onCite,
  onClose,
}: {
  chat: ReportChatApi;
  model: string | undefined;
  quote: string;
  setQuote: (quote: string) => void;
  focusKey: number;
  onCite: (title: string) => boolean;
  onClose: () => void;
}) {
  const { info, pending, draft } = chat;
  const messages = info?.messages ?? [];
  const [value, setValue] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [pulse, setPulse] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const busy = Boolean(pending && !pending.error);
  const thinking = Boolean(pending && !pending.error && !pending.content) || draft?.phase === "loading";

  useEffect(() => {
    areaRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  // A reply landed: the orb pulses once.
  const count = messages.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) setPulse((value) => value + 1);
    seen.current = count;
  }, [count]);

  // Follow the conversation unless the reader scrolled up.
  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread && pinned.current) thread.scrollTop = thread.scrollHeight;
  });

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 150)}px`;
  }, [value, quote]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const submit = (text = value) => {
    const question = text.trim();
    if (!question || busy) return;
    void chat.send(quote ? withQuote(quote, question) : question);
    setValue("");
    setQuote("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const followup = () => {
    void chat.beginDraft(value);
    setValue("");
  };

  const empty = !messages.length && !pending && !draft;

  return (
    <CiteContext.Provider value={onCite}>
      <motion.aside
        layoutId="report-chat-shell"
        className="chat-panel"
        aria-label="和主 agent 对话"
        transition={SPRING}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <header className="chat-head">
          <AgentOrb size="sm" thinking={thinking} pulse={pulse} />
          <span className="chat-head-name">主 agent</span>
          <ModelTag id={model} />
          <span className="chat-head-tools">
            {messages.length > 0 && (
              <button
                type="button"
                className={`g-btn g-btn-icon chat-tool${confirmClear ? " is-danger" : ""}`}
                aria-label="清空对话"
                title="清空对话"
                onClick={() => {
                  if (!confirmClear) return setConfirmClear(true);
                  setConfirmClear(false);
                  void chat.clear();
                }}
              >
                <IconTrash />
              </button>
            )}
            <button type="button" className="g-btn g-btn-icon chat-tool" aria-label="收起" title="收起" onClick={onClose}>
              <IconChevronDown />
            </button>
          </span>
        </header>

        <div
          ref={threadRef}
          className="chat-thread g-scroll"
          onScroll={(event) => {
            const element = event.currentTarget;
            pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          }}
        >
          {empty && (
            <div className="chat-empty">
              <AgentOrb size="lg" />
              <div className="chat-suggest">
                {SUGGESTIONS.map((text, index) => (
                  <motion.button
                    key={text}
                    type="button"
                    className="chat-suggest-chip"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.12 + index * 0.07 }}
                    onClick={() => submit(text)}
                  >
                    {text}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <Message key={index} message={message} />
          ))}
          {pending && (
            <>
              <Message message={{ role: "user", content: pending.text }} />
              <motion.div className="chat-msg is-assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {pending.content ? <ChatMarkdown text={pending.content} /> : !pending.error && <ThinkingDots />}
                {!pending.error && pending.content && <span className="chat-caret" aria-hidden="true" />}
                {pending.error && (
                  <p className="chat-error" role="alert">
                    {pending.error}
                    <button
                      type="button"
                      onClick={() => {
                        const text = pending.text;
                        chat.dismissError();
                        void chat.send(text);
                      }}
                    >
                      重试
                    </button>
                  </p>
                )}
              </motion.div>
            </>
          )}
          <AnimatePresence>{draft && <DraftCard key="draft" chat={chat} />}</AnimatePresence>
        </div>

        <div className="chat-compose">
          <AnimatePresence>
            {quote && (
              <motion.div className="chat-quote" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <span className="chat-quote-text">{quote}</span>
                <button type="button" aria-label="移除引用" onClick={() => setQuote("")}>
                  <IconClose />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <textarea
            ref={areaRef}
            className="chat-input"
            rows={1}
            maxLength={4000}
            placeholder="问问主 agent…"
            aria-label="问问主 agent"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="chat-compose-foot">
            <button type="button" className="chat-fork" onClick={followup} disabled={draft?.phase === "loading" || draft?.phase === "starting"}>
              <IconFork />
              继续调研
            </button>
            <button type="button" className="chat-send" aria-label="发送" title="发送" disabled={!value.trim() || busy} onClick={() => submit()}>
              <IconSend />
            </button>
          </div>
        </div>
      </motion.aside>
    </CiteContext.Provider>
  );
}

function ThinkingDots() {
  return (
    <span className="chat-thinking" aria-label="主 agent 正在思考">
      <i />
      <i />
      <i />
    </span>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    const quoted = /^> ([\s\S]*?)\n\n([\s\S]*)$/.exec(message.content);
    return (
      <motion.div className="chat-msg is-user" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={SPRING}>
        {quoted && <span className="chat-msg-quote">{quoted[1]}</span>}
        <span>{quoted ? quoted[2] : message.content}</span>
      </motion.div>
    );
  }
  return (
    <motion.div className="chat-msg is-assistant" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
      <ChatMarkdown text={message.content} />
    </motion.div>
  );
}

// -- follow-up draft ----------------------------------------------------------------------

function DraftCard({ chat }: { chat: ReportChatApi }) {
  const { draft } = chat;
  const choice = useModelChoice();
  const startRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const [typed, setTyped] = useState(0);
  const reduced = useGalaxy((state) => state.reducedMotion);
  const drafted = draft && (draft.phase === "ready" || draft.phase === "starting") ? draft.question : "";

  // The drafted question types itself in, then becomes editable.
  useEffect(() => {
    if (!drafted) return;
    setText(drafted);
    if (reduced) return setTyped(drafted.length);
    setTyped(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index = Math.min(drafted.length, index + 2);
      setTyped(index);
      if (index >= drafted.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [drafted, reduced]);

  if (!draft) return null;
  const typing = typed < text.length && draft.phase === "ready";

  return (
    <motion.section
      className={`chat-draft is-${draft.phase}`}
      aria-label="继续调研"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={SPRING}
      layout
    >
      <header className="chat-draft-head">
        <IconFork />
        继续调研
        {draft.phase !== "done" && draft.phase !== "starting" && (
          <button type="button" className="chat-draft-x" aria-label="取消" onClick={() => chat.setDraft(null)}>
            <IconClose />
          </button>
        )}
      </header>
      {draft.phase === "loading" && (
        <div className="chat-draft-loading" role="status">
          <i />
          <i />
          <i />
          <span>整理中…</span>
        </div>
      )}
      {draft.phase === "failed" && (
        <p className="chat-error" role="alert">
          {draft.error}
          <button type="button" onClick={() => void chat.beginDraft("")}>
            重试
          </button>
        </p>
      )}
      {(draft.phase === "ready" || draft.phase === "starting") && (
        <>
          <textarea
            className="chat-draft-text"
            value={typing ? text.slice(0, typed) : text}
            readOnly={typing || draft.phase === "starting"}
            rows={4}
            maxLength={8000}
            aria-label="新的研究问题"
            onChange={(event) => setText(event.target.value)}
          />
          {draft.error && (
            <p className="chat-error" role="alert">
              {draft.error}
            </p>
          )}
          <div className="chat-draft-foot">
            <div className="chat-draft-models" role="radiogroup" aria-label="研究模型">
              {MODELS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === choice}
                  title={option.name}
                  className="chat-draft-model"
                  onClick={() => setModelChoice(option.id)}
                >
                  <ModelMark id={option.id} size="xs" />
                  {option.id === choice && <span>{option.short}</span>}
                </button>
              ))}
            </div>
            <button type="button" className="chat-draft-cancel" onClick={() => chat.setDraft(null)} disabled={draft.phase === "starting"}>
              取消
            </button>
            <button
              ref={startRef}
              type="button"
              className="chat-draft-start"
              disabled={typing || draft.phase === "starting" || text.trim().length < 4}
              onClick={() => void chat.start(text.trim(), choice, startRef.current?.getBoundingClientRect() ?? null)}
            >
              {draft.phase === "starting" ? <span className="spinner" aria-hidden="true" /> : <IconFork />}
              开始调研
            </button>
          </div>
        </>
      )}
      {draft.phase === "done" && (
        <div className="chat-draft-done">
          <span className="chat-draft-star" aria-hidden="true" />
          新研究已开始
          <a href={draft.href}>前往 →</a>
        </div>
      )}
    </motion.section>
  );
}

// -- the star that flies to the lineage chips -------------------------------------------------

export function SpawnStar({ spawn, targetRef, onDone }: { spawn: Spawn; targetRef: RefObject<HTMLElement | null>; onDone: () => void }) {
  const reduced = useGalaxy((state) => state.reducedMotion);
  // Fixed once: the flight must not restart when the dialog re-renders mid-air.
  const [path] = useState(() => {
    const target = targetRef.current?.getBoundingClientRect();
    const from = { x: spawn.from.left + spawn.from.width / 2, y: spawn.from.top + spawn.from.height / 2 };
    const to = target ? { x: target.left + 14, y: target.top + target.height / 2 } : { x: from.x - 300, y: 60 };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // A gentle arc: the star rises before it falls into the chip.
    return { from, dx, dy, lift: Math.min(-80, dy * 0.4 - 60), angle: (Math.atan2(-dy, -dx) * 180) / Math.PI };
  });
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), reduced ? 50 : 1700);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  if (reduced) return null;
  const vars = {
    left: path.from.x,
    top: path.from.y,
    "--dx": `${path.dx}px`,
    "--dy": `${path.dy}px`,
    "--lift": `${path.lift}px`,
    "--trail": `${path.angle}deg`,
  } as CSSProperties;
  return createPortal(
    <div className="spawn-layer" aria-hidden="true" style={vars}>
      <span className="spawn-split" />
      <span className="spawn-star">
        <span className="spawn-trail" />
      </span>
      <span className="spawn-burst" />
    </div>,
    document.body,
  );
}

// -- lineage chips in the report header -------------------------------------------------------

export function Lineage({ info, bump, chipRef }: { info: ChatState | null; bump: number; chipRef: RefObject<HTMLSpanElement | null> }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const parent = info?.parent;
  const followups = info?.followups ?? [];
  return (
    <span className="report-lineage" ref={chipRef}>
      {parent && (
        <a className="lineage-chip" href={galaxyStudyHref(parent.id)} title={parent.title}>
          <span aria-hidden="true">↰</span>
          接续自 <b>{parent.title}</b>
        </a>
      )}
      {followups.length > 0 && (
        <span className="lineage-wrap" ref={wrapRef}>
          <motion.button
            key={bump}
            type="button"
            className="lineage-chip is-followups"
            aria-haspopup="menu"
            aria-expanded={open}
            initial={bump ? { scale: 1.35 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 14 }}
            onClick={() => setOpen((value) => !value)}
          >
            <IconFork />
            后续研究 {followups.length}
          </motion.button>
          <AnimatePresence>
            {open && (
              <motion.div
                role="menu"
                className="glass glass-pop lineage-menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {followups.map((item) => (
                  <a key={item.id} role="menuitem" className="g-menu-item" href={galaxyStudyHref(item.id)} title={item.title}>
                    <span className={`lineage-dot is-${item.status ?? "finished"}`} aria-hidden="true" />
                    <span className="lineage-title">{item.title}</span>
                  </a>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
      )}
    </span>
  );
}
