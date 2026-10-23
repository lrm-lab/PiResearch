const TIMEOUT_MS = 15_000;

/** PiResearch answered with something this service cannot use, or not at all. */
export class UpstreamError extends Error {
  /** @param {string} message @param {number} [status] the upstream HTTP status, 0 when unreachable */
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/** The study id PiResearch uses for a run: runs are homepage sessions. */
export const studyId = (runId) => `sessions/${runId}/1`;
export const runIdOf = (id) => String(id).split("/")[1];

/**
 * PiResearch's existing HTTP API (constellation/serve.py, via galaxy/serve.py) on the compose network.
 * @param {string} baseUrl
 * @param {typeof fetch} [fetchImpl]
 */
export function createPiResearchClient(baseUrl, fetchImpl = fetch) {
  async function request(path, init = {}) {
    try {
      return await fetchImpl(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new UpstreamError(`PiResearch is unreachable: ${error.message}`);
    }
  }
  return {
    /** POST /api/questions. @returns {Promise<{ id: string, status: string }>} */
    async start(question) {
      const res = await request("/api/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400) throw Object.assign(new UpstreamError(String(body.error ?? "rejected"), 400), { rejected: true });
      if (!res.ok || typeof body.id !== "string") throw new UpstreamError(`start failed (${res.status})`, res.status);
      if (body.status === "failed") throw new UpstreamError(String(body.error || "the run did not start"), 200);
      return body;
    },
    /** GET /api/history?compact=1: every study with its id, status, created_at and error. */
    async history() {
      const res = await request("/api/history?compact=1");
      if (!res.ok) throw new UpstreamError(`history failed (${res.status})`, res.status);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new UpstreamError("history is not a list");
      return rows;
    },
    /** GET /api/studies/<id>/thumbnail: counts of the study's tasks, null when unavailable. */
    async progress(runId) {
      try {
        const res = await request(`/api/studies/${studyId(runId)}/thumbnail`);
        if (!res.ok) return null;
        const body = await res.json();
        const tasks = (body.nodes ?? []).filter((node) => !node.goal);
        return { tasks_total: tasks.length, tasks_done: tasks.filter((node) => node.status && node.status !== "open").length };
      } catch {
        return null;
      }
    },
    /** GET /api/studies/<id>/report. @returns {Promise<string | null>} null while there is none */
    async report(runId) {
      const res = await request(`/api/studies/${studyId(runId)}/report`);
      if (res.status === 404) return null;
      if (!res.ok) throw new UpstreamError(`report failed (${res.status})`, res.status);
      return res.text();
    },
  };
}
