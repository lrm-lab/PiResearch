import { describe, expect, it } from "vitest";
import { CHAT_NETWORK, ChatHttpError, parseSse, streamChat } from "./chatStream";

describe("parseSse", () => {
  it("parses events and keeps the unfinished tail", () => {
    const text =
      'event: start\ndata: {"user":{"role":"user","content":"hi","at":"t"}}\n\n' +
      'event: delta\ndata: {"text":"你"}\n\nevent: delta\ndata: {"te';
    const { events, rest } = parseSse(text);
    expect(events).toEqual([
      { type: "start", user: { role: "user", content: "hi", at: "t" } },
      { type: "delta", text: "你" },
    ]);
    expect(rest).toBe('event: delta\ndata: {"te');
  });

  it("ignores keep-alive comments, CRLF and malformed data", () => {
    const { events } = parseSse(': ping\n\r\nevent: delta\r\ndata: nope\r\n\r\n: x\n\nevent: delta\ndata: {"text":"a"}\n\n');
    expect(events).toEqual([{ type: "delta", text: "a" }]);
  });

  it("reads done and error", () => {
    const { events } = parseSse(
      'event: done\ndata: {"message":{"role":"assistant","content":"ok","at":"t"}}\n\nevent: error\ndata: {"error":"坏了"}\n\nevent: error\ndata: {}\n\n',
    );
    expect(events).toEqual([
      { type: "done", message: { role: "assistant", content: "ok", at: "t" } },
      { type: "error", error: "坏了" },
      { type: "error", error: CHAT_NETWORK },
    ]);
  });
});

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("streamChat", () => {
  it("emits events across chunk boundaries, including split multibyte characters", async () => {
    const full = 'event: delta\ndata: {"text":"你好"}\n\nevent: done\ndata: {"message":{"role":"assistant","content":"你好","at":"t"}}\n\n';
    const bytes = new TextEncoder().encode(full);
    const cut = 30;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      }),
    );
    const seen: string[] = [];
    await streamChat("/x", "hi", (event) => seen.push(event.type), { fetchImpl: async () => response });
    expect(seen).toEqual(["delta", "done"]);
  });

  it("adds an error when the stream ends early", async () => {
    const seen: string[] = [];
    await streamChat("/x", "hi", (event) => seen.push(event.type), {
      fetchImpl: async () => streamResponse(['event: delta\ndata: {"text":"a"}\n\n']),
    });
    expect(seen).toEqual(["delta", "error"]);
  });

  it("throws the JSON error of a non-2xx answer", async () => {
    const failing = async () => new Response('{"error":"太长了"}', { status: 400 });
    await expect(streamChat("/x", "hi", () => {}, { fetchImpl: failing })).rejects.toMatchObject({
      status: 400,
      message: "太长了",
    });
    await expect(streamChat("/x", "hi", () => {}, { fetchImpl: failing })).rejects.toBeInstanceOf(ChatHttpError);
  });
});
