// The report chat with a finished study's main agent, and follow-up studies built on it.
// API: GET/POST/DELETE <study>/chat (POST streams server-sent events), POST <study>/followup,
// POST /api/questions with `parent`.

import { galaxyHrefFromApi } from "../home/format";
import { studyApiPrefix } from "./api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at?: string;
}

export interface StudyLink {
  id: string;
  title: string;
  status?: string;
}

export interface ChatState {
  available: boolean;
  messages: ChatMessage[];
  parent: StudyLink | null;
  followups: StudyLink[];
}

export const NETWORK_ERROR = "网络断了，稍后再试。";
export const QUOTE_LIMIT = 600;

async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error) return payload.error;
  } catch {
    // Not JSON.
  }
  return fallback;
}

export async function fetchChat(studyId: string, signal?: AbortSignal): Promise<ChatState> {
  const response = await fetch(`${studyApiPrefix(studyId)}/chat`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(await errorOf(response, NETWORK_ERROR));
  const payload = (await response.json()) as Partial<ChatState>;
  return {
    available: Boolean(payload.available),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    parent: payload.parent ?? null,
    followups: Array.isArray(payload.followups) ? payload.followups : [],
  };
}

export async function clearChat(studyId: string): Promise<void> {
  await fetch(`${studyApiPrefix(studyId)}/chat`, { method: "DELETE" });
}

export interface SseEvent {
  event: string;
  data: unknown;
}

/** Split a server-sent event buffer into complete events and the unfinished rest. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join("\n")) });
    } catch {
      // A malformed event is skipped.
    }
  }
  return { events, rest };
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
}

/** Send a message; resolves with the main agent's full reply, rejects with the inline error copy. */
export async function streamChat(studyId: string, message: string, handlers: StreamHandlers, signal?: AbortSignal): Promise<ChatMessage> {
  let response: Response;
  try {
    response = await fetch(`${studyApiPrefix(studyId)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(NETWORK_ERROR);
  }
  if (!response.ok || !response.body) throw new Error(await errorOf(response, NETWORK_ERROR));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(NETWORK_ERROR);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const { event, data } of parsed.events) {
      const payload = (data ?? {}) as { text?: string; error?: string; message?: ChatMessage };
      if (event === "delta" && payload.text) {
        text += payload.text;
        handlers.onDelta(payload.text);
      } else if (event === "error") {
        throw new Error(payload.error || NETWORK_ERROR);
      } else if (event === "done" && payload.message) {
        return payload.message;
      }
    }
  }
  if (text) return { role: "assistant", content: text };
  throw new Error(NETWORK_ERROR);
}

export async function draftFollowup(studyId: string, hint: string, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${studyApiPrefix(studyId)}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hint }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(NETWORK_ERROR);
  }
  if (!response.ok) throw new Error(await errorOf(response, NETWORK_ERROR));
  const payload = (await response.json()) as { question?: unknown };
  if (typeof payload.question !== "string" || !payload.question.trim()) throw new Error("没能整理出新的研究题目，再试一次。");
  return payload.question.trim();
}

/** Start the follow-up study; resolves with its Galaxy page. */
export async function startFollowup(parent: string, question: string, model: string): Promise<{ id: string; href: string }> {
  let response: Response;
  try {
    response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, model, parent }),
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!response.ok) throw new Error(await errorOf(response, "没有提交成功。"));
  const payload = (await response.json()) as { id?: unknown; href?: unknown };
  return {
    id: typeof payload.id === "string" ? payload.id : "",
    href: galaxyHrefFromApi(typeof payload.href === "string" ? payload.href : null),
  };
}

/** "> quote\n\nquestion" for a question about a passage of the report. */
export function withQuote(quote: string, question: string): string {
  const clipped = quote.replace(/\s+/g, " ").trim().slice(0, QUOTE_LIMIT);
  return clipped ? `> ${clipped}\n\n${question}` : question;
}

// -- citations -----------------------------------------------------------------

const CITE = /【§([^】\n]{1,120})】/g;
export const CITE_PREFIX = "#cite:";

/** Replace 【§标题】 with Markdown links the renderer turns into citation chips. */
export function linkCitations(markdown: string): string {
  return markdown.replace(CITE, (_, title: string) => `[${title.trim().replace(/[[\]]/g, "")}](${CITE_PREFIX}${encodeURIComponent(title.trim())})`);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").replace(/^[\d.、]+/, "").toLowerCase();
}

/** The report heading a citation names: exact text first, then a prefix, then containment either way. */
export function findHeading<T extends { textContent: string | null }>(headings: readonly T[], title: string): T | null {
  const want = normalize(title);
  if (!want) return null;
  const texts = headings.map((heading) => normalize(heading.textContent ?? ""));
  const exact = texts.findIndex((text) => text === want);
  if (exact >= 0) return headings[exact]!;
  const prefix = texts.findIndex((text) => text.startsWith(want) || want.startsWith(text));
  if (prefix >= 0 && texts[prefix]) return headings[prefix]!;
  const inside = texts.findIndex((text) => text && (text.includes(want) || want.includes(text)));
  return inside >= 0 ? headings[inside]! : null;
}
