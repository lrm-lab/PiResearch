// Report chat API: the thread, clearing it, drafting a follow-up question and starting the study.
// The streaming POST lives in chatStream.ts.

import type { ModelId } from "./model";
import { CHAT_NETWORK } from "./chatStream";
import { studyApiPrefix } from "./api";
import type { ChatThread, StudyStatus } from "../types/api";

async function failure(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error) return new Error(payload.error);
  } catch {
    // not JSON
  }
  return new Error(CHAT_NETWORK);
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(CHAT_NETWORK);
  }
  if (!response.ok) throw await failure(response);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(CHAT_NETWORK);
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function chatUrl(studyId: string): string {
  return `${studyApiPrefix(studyId)}/chat`;
}

export async function fetchChatThread(studyId: string, signal?: AbortSignal): Promise<ChatThread> {
  const data = await send<Partial<ChatThread>>(chatUrl(studyId), { signal, cache: "no-store" });
  return {
    available: data.available === true,
    messages: Array.isArray(data.messages) ? data.messages : [],
    parent: data.parent ?? null,
    followups: Array.isArray(data.followups) ? data.followups : [],
  };
}

export async function clearChatThread(studyId: string): Promise<void> {
  await send<{ ok: boolean }>(chatUrl(studyId), { method: "DELETE" });
}

/** The main agent's draft of a follow-up question (5–40 s). */
export async function requestFollowup(studyId: string, hint: string, signal?: AbortSignal): Promise<string> {
  const data = await send<{ question?: unknown }>(`${studyApiPrefix(studyId)}/followup`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(hint.trim() ? { hint: hint.trim() } : {}),
    signal,
  });
  const question = typeof data.question === "string" ? data.question.trim() : "";
  if (!question) throw new Error(CHAT_NETWORK);
  return question;
}

export interface StartedStudy {
  id: string;
  title: string;
  status: StudyStatus;
}

/** POST /api/questions with `parent`: the new study's row. */
export async function startFollowupStudy(question: string, model: ModelId, parent: string): Promise<StartedStudy> {
  const row = await send<{ id?: unknown; title?: unknown; status?: unknown }>("/api/questions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ question, model, parent }),
  });
  if (typeof row.id !== "string" || !row.id) throw new Error(CHAT_NETWORK);
  return {
    id: row.id,
    title: typeof row.title === "string" && row.title ? row.title : question,
    status: row.status === "finished" || row.status === "failed" ? row.status : "running",
  };
}
