/**
 * The Agent manifest (coforge-agent-manifest.v1) and the single source of truth for the
 * service's routes: app.js builds its routes, input checks and scope checks from `actions`.
 * `required_scopes` are Login with CoForge scopes (openid, profile, identity, email), not scopes this
 * app invents: `coforge app invoke` asks for a token of exactly those (plus the fixed openid, profile
 * and identity), so list only what the action truly needs. `[]` means identity only. Authorization
 * beyond that (who may touch which note) is the app's own business: see the handlers in app.js.
 * Agents read this document; keep descriptions plain and factual.
 */

export const MANIFEST_PATH = "/.well-known/coforge-agent-manifest.json";
export const API_PREFIX = "/api/coforge";

export const MAX_QUESTION_CHARS = 4000;
const STATUSES = ["queued", "running", "completed", "failed"];
const RUN_ID = { type: "string", minLength: 1, maxLength: 80 };

export const actions = [
  {
    name: "research.start",
    description:
      "Start a deep research run on a question. Returns a run_id at once; the run takes many minutes. Poll research.status, then read research.report. Send the same Idempotency-Key to retry safely.",
    effect: "create",
    endpoint: { method: "POST", path: "/research" },
    idempotency: "key_required",
    idempotency_header: "Idempotency-Key",
    required_scopes: [],
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The research question, in any language.", minLength: 1, maxLength: MAX_QUESTION_CHARS },
      },
      required: ["question"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: { run_id: { type: "string" }, status: { type: "string", enum: STATUSES }, status_url: { type: "string" } },
    },
  },
  {
    name: "research.status",
    description: "Read the status and progress of a run this Workspace started.",
    effect: "read",
    endpoint: { method: "GET", path: "/research/{run_id}" },
    idempotency: "safe",
    required_scopes: [],
    input_schema: { type: "object", properties: { run_id: RUN_ID }, required: ["run_id"], additionalProperties: false },
    output_schema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        status: { type: "string", enum: STATUSES },
        started_at: { type: "string" },
        progress: {
          type: "object",
          properties: { tasks_total: { type: "integer" }, tasks_done: { type: "integer" } },
        },
        error: { type: "string" },
      },
    },
  },
  {
    name: "research.report",
    description: "Read the finished Markdown report of a run. Answers 409 until the run is completed.",
    effect: "read",
    endpoint: { method: "GET", path: "/research/{run_id}/report" },
    idempotency: "safe",
    required_scopes: [],
    input_schema: { type: "object", properties: { run_id: RUN_ID }, required: ["run_id"], additionalProperties: false },
    output_schema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        status: { type: "string", enum: STATUSES },
        report_markdown: { type: "string" },
        truncated: { type: "boolean" },
      },
    },
  },
];

/** @param {import("./config.js").Config} config */
export function buildManifest(config) {
  return {
    schema: "coforge-agent-manifest.v1",
    name: "coforge-app",
    description: "A small notes service Agents can read from and write to.",
    app_origin: config.appOrigin,
    execution: { mode: "http_api", base_url: `${config.appOrigin}${API_PREFIX}` },
    auth: { type: "login_with_coforge" },
    actions,
  };
}
