// The only two writes the home page makes: POST /api/questions and
// DELETE /api/studies/<id>. Dev mock flags (flags.ts) short-circuit both.

import { flags } from "./flags";
import { DELETE_FAILED, DELETE_NETWORK, deleteUrl, galaxyHrefFromApi, SUBMIT_FAILED, SUBMIT_NETWORK } from "./format";
import { useHome } from "./store";

export type SubmitResult = { ok: true; href: string } | { ok: false; error: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockSubmit(mode: string): Promise<SubmitResult> {
  await wait(650);
  if (mode === "network") return { ok: false, error: SUBMIT_NETWORK };
  if (mode === "error") return { ok: false, error: "问题太短了。" };
  const rows = useHome.getState().rows ?? [];
  const target = rows.find((row) => row.status === "running") ?? rows[0];
  return { ok: true, href: galaxyHrefFromApi(target?.href ?? "/study/sessions/mock/1") };
}

/** POST {question, model, images?}. Errors carry `payload.error`, 没有提交成功。 or the network copy. */
export async function submitQuestion(
  question: string,
  model: string,
  images?: { name: string; mime: string; data: string }[],
): Promise<SubmitResult> {
  if (flags.mockSubmit) return mockSubmit(flags.mockSubmit);
  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, model, images: images?.length ? images : undefined }),
    });
    let payload: { error?: unknown; href?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok) {
      return { ok: false, error: typeof payload.error === "string" && payload.error ? payload.error : SUBMIT_FAILED };
    }
    return { ok: true, href: galaxyHrefFromApi(typeof payload.href === "string" ? payload.href : null) };
  } catch {
    return { ok: false, error: SUBMIT_NETWORK };
  }
}

async function mockDelete(mode: string): Promise<void> {
  await wait(700);
  if (mode === "error") throw new Error(DELETE_FAILED);
  if (mode === "network") throw new Error(DELETE_NETWORK);
}

/** DELETE the study. Throws an Error whose message is the inline copy. */
export async function deleteStudy(id: string): Promise<void> {
  if (flags.mockDelete) return mockDelete(flags.mockDelete);
  let response: Response;
  try {
    response = await fetch(deleteUrl(id), { method: "DELETE" });
  } catch {
    throw new Error(DELETE_NETWORK);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof payload.error === "string" && payload.error ? payload.error : DELETE_FAILED);
  }
}
