// POST /api/studies/<id>/chat answers with text/event-stream. It is a POST, so EventSource is out:
// read the body with fetch, split on blank lines, ignore ":" keep-alive comments.

import type { ChatEvent } from "../types/api";

export const CHAT_NETWORK = "网络断了，稍后再试。";

/** A non-2xx answer; `message` is the JSON body's `error` when it has one. */
export class ChatHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatHttpError";
    this.status = status;
  }
}

function parseBlock(block: string): ChatEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  }
  if (!data.length) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(data.join("\n"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (name === "start" && body.user) return { type: "start", user: body.user as never };
  if (name === "delta" && typeof body.text === "string") return { type: "delta", text: body.text };
  if (name === "done" && body.message) return { type: "done", message: body.message as never };
  if (name === "error") return { type: "error", error: typeof body.error === "string" && body.error ? body.error : CHAT_NETWORK };
  return null;
}

/** Complete events in `buffer` and the unfinished remainder to prepend to the next chunk. */
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const text = buffer.replace(/\r\n?/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const block of blocks) {
    const event = parseBlock(block);
    if (event) events.push(event);
  }
  return { events, rest };
}

/**
 * Sends `message` and calls `onEvent` for every event. Resolves when the stream ends (a stream that
 * ends without done/error gets a synthetic error); rejects with ChatHttpError for a non-2xx answer
 * and with the network error otherwise (aborts included).
 */
export async function streamChat(
  url: string,
  message: string,
  onEvent: (event: ChatEvent) => void,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const doFetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const response = await doFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message }),
    signal: options.signal,
  });
  if (!response.ok) {
    let error = "";
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") error = payload.error;
    } catch {
      // not JSON
    }
    throw new ChatHttpError(response.status, error || CHAT_NETWORK);
  }
  if (!response.body) throw new ChatHttpError(response.status, CHAT_NETWORK);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const emit = (event: ChatEvent) => {
    if (event.type === "done" || event.type === "error") finished = true;
    onEvent(event);
  };
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseSse(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.rest;
    parsed.events.forEach(emit);
    if (done) break;
  }
  if (!finished) onEvent({ type: "error", error: CHAT_NETWORK });
}
