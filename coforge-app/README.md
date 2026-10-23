# PiResearch CoForge App

Lets CoForge Agents run PiResearch deep research with `coforge app invoke`. It is a small sidecar
generated from `create-coforge-app`'s `hosted-http-action-service` template: it publishes the Agent manifest,
verifies the short-lived Agent access token, validates input, honours an idempotency key, and calls
PiResearch's own HTTP API over the compose network. It holds no CoForge secret.

## What it serves

Caddy sends `/.well-known/coforge-agent-manifest.json` and `/api/coforge/*` here; everything else goes to PiResearch.

| Action | Route | Does |
| --- | --- | --- |
| `research.start` | `POST /api/coforge/research` (header `Idempotency-Key`) | Starts a run (`POST /api/questions`). Input `question`, 1 to 4000 characters. Returns `run_id`, `status`, `status_url`. |
| `research.status` | `GET /api/coforge/research/{run_id}` | `status` is `running`, `completed` or `failed`, with `started_at`, `progress` (`tasks_total`, `tasks_done`) and `error`. |
| `research.report` | `GET /api/coforge/research/{run_id}/report` | `report_markdown` once completed, else `409`. Capped at 900,000 bytes (`truncated: true`). |

- Workspace isolation: `data/runs.json` (the `/data` volume) records which Workspace started each run. Another Workspace, and runs
  started in the PiResearch web UI, answer 404.
- At most `COFORGE_MAX_CONCURRENT_RUNS` (default 2) runs per Workspace in progress; more answer `429`.
- Idempotency keys live in memory: a sidecar restart forgets them, so a retry after a restart can start a second run.
- Off by default: with `COFORGE_ISSUER` unset the service answers 404 on every route.
- `finished_at` is not reported: PiResearch does not record it.

## Environment

Set these in the PiResearch server's `.env` (managed outside the repo); compose passes them on. See `.env.example`.

| Variable | Meaning |
| --- | --- |
| `COFORGE_ISSUER` | `<CoForge origin>/oidc`, no trailing slash. Unset turns the app off. |
| `COFORGE_CLIENT_ID` | The app's client ID; Agent tokens carry it as `aud`. |
| `APP_ORIGIN` | `https://82.157.184.89`. The manifest's `base_url` is `APP_ORIGIN/api/coforge`. |
| `COFORGE_MAX_CONCURRENT_RUNS` | Optional, default 2. |

## Register and use

1. A Workspace owner or admin registers the app in Settings, Applications: name `PiResearch`, homepage
   `https://82.157.184.89`, no redirect URIs. Copy the client ID into the server's `.env` as
   `COFORGE_CLIENT_ID`, set `COFORGE_ISSUER` and `APP_ORIGIN`, then deploy (or `docker compose up -d`).
   CoForge's OIDC issuer must be enabled for this to work.
2. Install the app and let the Agent have access (the first `coforge app invoke` asks a person to approve).
3. As an Agent:

```bash
coforge app invoke piresearch --list-actions
coforge app invoke piresearch research.start --param question="固态电池产业格局"   # prints run_id and the idempotency key
coforge app invoke piresearch research.status --param run_id=<run_id>              # poll until completed (minutes)
coforge app invoke piresearch research.report --param run_id=<run_id>
```

Repeat a `research.start` with `--idempotency-key <key>` and it returns the same run.

## Develop

```bash
npm install
npm test     # fake PiResearch HTTP server, tokens signed with a local key, manifest checked against the vendored schema
```

`test/fixtures/` holds CoForge's published manifest schema; `SOURCE.md` records its commit. Contract notes for
agents working here are in `AGENTS.md`.
