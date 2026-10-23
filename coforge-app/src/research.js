import { UpstreamError, createPiResearchClient, runIdOf } from "./piresearch.js";
import { API_PREFIX } from "./manifest.js";

/** The CLI reads at most 1 MiB of a response. */
export const MAX_REPORT_BYTES = 900_000;
const RUN_ID = /^[A-Za-z0-9._-]{1,80}$/;
const STATUS = { running: "running", failed: "failed", finished: "completed" };

const notFound = { status: 404, body: { error: "not_found", message: "No such run" } };
const upstreamDown = (error) => ({ status: 502, body: { error: "upstream_unavailable", message: error.message } });

/**
 * The handlers behind the manifest's actions. Workspace isolation lives here: a run is reachable only
 * by the Workspace recorded in the run store, and PiResearch's web UI runs are not in the store.
 * @param {{ config: import("./config.js").Config, store: ReturnType<import("./runs.js").createRunStore>, client?: ReturnType<typeof createPiResearchClient> }} deps
 */
export function createResearchHandlers({ config, store, client = createPiResearchClient(config.piresearchUrl) }) {
  // Counting runs and starting one must not interleave, or two calls could both pass the limit.
  let queue = Promise.resolve();
  const exclusive = (fn) => {
    const result = queue.then(fn, fn);
    queue = result.catch(() => {});
    return result;
  };

  async function studies() {
    return new Map((await client.history()).map((row) => [runIdOf(row.id), row]));
  }

  async function runningCount(workspaceId) {
    const active = store.active(workspaceId);
    if (active.length < config.maxConcurrentRuns) return active.length;
    const known = await studies();
    let running = 0;
    for (const id of active) {
      const row = known.get(id);
      if (row && row.status === "running") running += 1;
      else store.markDone(id);
    }
    return running;
  }

  return {
    "research.start": ({ question }, caller) =>
      exclusive(async () => {
        try {
          if ((await runningCount(caller.workspaceId)) >= config.maxConcurrentRuns) {
            return {
              status: 429,
              body: { error: "too_many_runs", message: `This Workspace already has ${config.maxConcurrentRuns} runs in progress; wait for one to finish` },
            };
          }
          const started = await client.start(question);
          const runId = runIdOf(started.id);
          store.add(runId, caller.workspaceId, caller.agentId);
          return { status: 202, body: { run_id: runId, status: "running", status_url: `${config.appOrigin}${API_PREFIX}/research/${runId}` } };
        } catch (error) {
          if (error.rejected) return { status: 400, body: { error: "invalid_input", message: error.message } };
          if (error instanceof UpstreamError) return upstreamDown(error);
          throw error;
        }
      }),

    "research.status": async ({ run_id: runId }, caller) => {
      const run = RUN_ID.test(runId) ? store.get(runId, caller.workspaceId) : undefined;
      if (!run) return notFound;
      try {
        const row = (await studies()).get(runId);
        if (!row) {
          store.forget(runId); // deleted in PiResearch
          return notFound;
        }
        const status = STATUS[row.status] ?? "running";
        if (status !== "running") store.markDone(runId);
        const body = { run_id: runId, status, started_at: row.created_at || run.createdAt };
        const progress = await client.progress(runId);
        if (progress) body.progress = progress;
        if (status === "failed") body.error = row.error || "The run did not complete";
        return { status: 200, body };
      } catch (error) {
        if (error instanceof UpstreamError) return upstreamDown(error);
        throw error;
      }
    },

    "research.report": async ({ run_id: runId }, caller) => {
      const run = RUN_ID.test(runId) ? store.get(runId, caller.workspaceId) : undefined;
      if (!run) return notFound;
      try {
        const row = (await studies()).get(runId);
        if (!row) return notFound;
        const status = STATUS[row.status] ?? "running";
        if (status !== "completed") {
          return { status: 409, body: { error: "report_not_ready", message: `The run is ${status}; the report exists once it is completed`, status } };
        }
        const text = await client.report(runId);
        if (!text) return { status: 409, body: { error: "report_unavailable", message: "The run finished without a report", status } };
        const bytes = Buffer.from(text, "utf8");
        const truncated = bytes.length > MAX_REPORT_BYTES;
        const report = truncated ? bytes.subarray(0, MAX_REPORT_BYTES).toString("utf8").replace(/�+$/, "") : text;
        return { status: 200, body: { run_id: runId, status, report_markdown: report, truncated } };
      } catch (error) {
        if (error instanceof UpstreamError) return upstreamDown(error);
        throw error;
      }
    },
  };
}


