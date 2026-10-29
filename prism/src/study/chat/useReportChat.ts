// State of one study's report chat: the thread, the turn in flight, the follow-up draft, and
// whether the panel is open. Components only render it.

import { useCallback, useEffect, useRef, useState } from "react";
import { clearChatThread, chatUrl, fetchChatThread, requestFollowup, startFollowupStudy } from "../../lib/chat";
import { CHAT_NETWORK, ChatHttpError, streamChat } from "../../lib/chatStream";
import { quotedMessage } from "../../lib/citations";
import { getModelChoice } from "../../lib/model";
import type { ChatMessage, ChatThread, FollowupLink } from "../../types/api";

export interface Turn {
  user: string;
  reply: string;
  phase: "waiting" | "streaming" | "error";
  error: string;
}

export interface Draft {
  phase: "loading" | "ready" | "starting" | "started";
  text: string;
  error: string;
  /** Study started from this draft. */
  started: FollowupLink | null;
}

const EMPTY: ChatThread = { available: false, messages: [], parent: null, followups: [] };

export function useReportChat(studyId: string) {
  const [thread, setThread] = useState<ChatThread>(EMPTY);
  const [ready, setReady] = useState(false);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const draftAbort = useRef<AbortController | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const draftRef = useRef<Draft | null>(null);
  turnRef.current = turn;
  draftRef.current = draft;

  useEffect(() => {
    const controller = new AbortController();
    setThread(EMPTY);
    setReady(false);
    setTurn(null);
    setDraft(null);
    setOpen(false);
    setQuote(null);
    fetchChatThread(studyId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setThread(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => {
      controller.abort();
      abort.current?.abort();
      draftAbort.current?.abort();
    };
  }, [studyId]);

  const patchTurn = useCallback((fn: (turn: Turn) => Turn) => setTurn((current) => (current ? fn(current) : current)), []);

  /** Sends `text` (with the attached quote); resolves false when it was refused outright. */
  const send = useCallback(
    async (text: string, attached: string | null = null): Promise<void> => {
      const question = text.trim();
      if (!question || (turnRef.current && turnRef.current.phase !== "error")) return;
      const content = quotedMessage(attached, question);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setTurn({ user: content, reply: "", phase: "waiting", error: "" });
      try {
        await streamChat(
          chatUrl(studyId),
          content,
          (event) => {
            if (controller.signal.aborted) return;
            if (event.type === "start") patchTurn((t) => ({ ...t, user: event.user.content }));
            else if (event.type === "delta") patchTurn((t) => ({ ...t, phase: "streaming", reply: t.reply + event.text }));
            else if (event.type === "done") {
              const user: ChatMessage = { role: "user", content: turnRef.current?.user ?? content, at: new Date().toISOString() };
              setThread((current) => ({ ...current, messages: [...current.messages, user, event.message] }));
              setTurn(null);
              setPulse((n) => n + 1);
            } else patchTurn((t) => ({ ...t, phase: "error", error: event.error }));
          },
          { signal: controller.signal },
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ChatHttpError ? error.message : CHAT_NETWORK;
        patchTurn((t) => ({ ...t, phase: "error", error: message }));
      }
    },
    [studyId, patchTurn],
  );

  const retry = useCallback(() => {
    const current = turnRef.current;
    if (!current || current.phase !== "error") return;
    // The user's message is already quoted if it had a quote; send it as is.
    void send(current.user);
  }, [send]);

  const clear = useCallback(async () => {
    abort.current?.abort();
    setTurn(null);
    setThread((current) => ({ ...current, messages: [] }));
    try {
      await clearChatThread(studyId);
    } catch {
      fetchChatThread(studyId).then(setThread).catch(() => {});
    }
  }, [studyId]);

  const draftFollowup = useCallback(
    async (hint: string) => {
      if (draftRef.current?.phase === "loading" || draftRef.current?.phase === "starting") return;
      draftAbort.current?.abort();
      const controller = new AbortController();
      draftAbort.current = controller;
      setOpen(true);
      setDraft({ phase: "loading", text: "", error: "", started: null });
      try {
        const question = await requestFollowup(studyId, hint, controller.signal);
        if (!controller.signal.aborted) setDraft({ phase: "ready", text: question, error: "", started: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setDraft({ phase: "ready", text: "", error: error instanceof Error ? error.message : CHAT_NETWORK, started: null });
      }
    },
    [studyId],
  );

  const editDraft = useCallback((text: string) => setDraft((d) => (d ? { ...d, text, error: "" } : d)), []);

  const cancelDraft = useCallback(() => {
    draftAbort.current?.abort();
    setDraft(null);
  }, []);

  /** Starts the study; resolves with the new study (for the spawn animation) or null on failure. */
  const startDraft = useCallback(async (): Promise<FollowupLink | null> => {
    const current = draftRef.current;
    if (!current || current.phase !== "ready" || !current.text.trim()) return null;
    setDraft({ ...current, phase: "starting", error: "" });
    try {
      const row = await startFollowupStudy(current.text.trim(), getModelChoice(), studyId);
      const started: FollowupLink = { id: row.id, title: row.title, status: row.status };
      setDraft({ phase: "started", text: current.text, error: "", started });
      setThread((t) => ({ ...t, followups: t.followups.some((f) => f.id === row.id) ? t.followups : [...t.followups, started] }));
      return started;
    } catch (error) {
      setDraft({ ...current, phase: "ready", error: error instanceof Error ? error.message : CHAT_NETWORK });
      return null;
    }
  }, [studyId]);

  const askAbout = useCallback((text: string) => {
    setQuote(text);
    setOpen(true);
  }, []);

  return {
    thread,
    ready,
    turn,
    draft,
    open,
    quote,
    pulse,
    busy: Boolean(turn && turn.phase !== "error"),
    setOpen,
    setQuote,
    send,
    retry,
    clear,
    draftFollowup,
    editDraft,
    cancelDraft,
    startDraft,
    askAbout,
  };
}

export type ReportChat = ReturnType<typeof useReportChat>;
