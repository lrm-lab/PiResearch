import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { actions } from "../src/manifest.js";
import { createResearchHandlers } from "../src/research.js";
import { createRunStore } from "../src/runs.js";

const ISSUER = "https://coforge.example.com/oidc";
const CLIENT_ID = "piresearch";
const BASE = "https://research.example.com";
const env = { COFORGE_ISSUER: ISSUER, COFORGE_CLIENT_ID: CLIENT_ID, APP_ORIGIN: BASE, PIRESEARCH_INTERNAL_URL: "http://127.0.0.1:1" };
const config = loadConfig(env);

/** A stand-in for PiResearch's internal HTTP API: the endpoints constellation/serve.py exposes. */
function fakePiResearch() {
  const state = { studies: new Map(), reports: new Map(), starts: 0, down: false, rejectStart: false };
  const server = createServer((req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type }).end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (state.down) return req.socket.destroy();
    const url = new URL(req.url, "http://x");
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (req.method === "POST" && url.pathname === "/api/questions") {
        if (state.rejectStart) return send(400, { error: "问题太短了。" });
        state.starts += 1;
        const id = `sessions/2026010${state.starts}-120000/1`;
        state.studies.set(id, { id, status: "running", created_at: "2026-01-01T12:00:00+08:00", error: "", question: JSON.parse(raw).question });
        return send(200, state.studies.get(id));
      }
      if (url.pathname === "/api/history") return send(200, [...state.studies.values()].map(({ question, ...row }) => row));
      const match = /^\/api\/studies\/(.+)\/(thumbnail|report)$/.exec(url.pathname);
      if (match && match[2] === "thumbnail") {
        return send(200, { nodes: [{ id: "goal", goal: true, status: "" }, { id: "t1", status: "done" }, { id: "t2", status: "open" }] });
      }
      if (match && match[2] === "report") {
        return state.reports.has(match[1]) ? send(200, state.reports.get(match[1]), "text/plain") : send(404, "none", "text/plain");
      }
      send(404, "not found", "text/plain");
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` })),
  );
}


let app;
let keys;
let privateKey;
let otherKey;

/** An Agent access token shaped like docs: RFC 9068, ES256, typ at+jwt, 5 minutes. */
async function token(overrides = {}, { key = privateKey, typ = "at+jwt", expiresIn = "5m" } = {}) {
  const claims = {
    client_id: CLIENT_ID,
    type: "agent",
    workspace_id: "w1",
    workspace_slug: "acme",
    scope: "openid profile identity",
    ...overrides.claims,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? CLIENT_ID)
    .setSubject(overrides.sub ?? "agent-1")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setJti(crypto.randomUUID())
    .sign(key);
}

const call = async (path, { method = "GET", bearer, body, headers = {} } = {}) =>
  app.request(`${BASE}${path}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("hosted HTTP action service", () => {
  before(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair("ES256")).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" };
    keys = createLocalJWKSet({ keys: [jwk] });
    app = createApp(config, { keys, handlers: Object.fromEntries(actions.map((a) => [a.name, () => ({ status: 200, body: {} })])) });
  });

  test("is off (no config) without COFORGE_ISSUER", () => {
    assert.equal(loadConfig({}), null);
    assert.throws(() => loadConfig({ COFORGE_ISSUER: ISSUER }), /Missing environment variable/);
    assert.throws(() => loadConfig({ ...env, COFORGE_MAX_CONCURRENT_RUNS: "0" }), /positive integer/);
  });

  test("publishes the manifest without authentication", async () => {
    const res = await call("/.well-known/coforge-agent-manifest.json");
    assert.equal(res.status, 200);
    const manifest = await res.json();
    assert.equal(manifest.schema, "coforge-agent-manifest.v1");
    assert.equal(manifest.execution.base_url, `${BASE}/api/coforge`);
  });

  describe("access token verification", () => {
    test("no token: 401 with a bare challenge", async () => {
      const res = await call("/api/coforge/research/x");
      assert.equal(res.status, 401);
      assert.match(res.headers.get("www-authenticate"), /^Bearer realm=/);
    });

    for (const [name, make] of [
      ["wrong issuer", () => token({ iss: "https://evil.example/oidc" })],
      ["wrong audience", () => token({ aud: "another-app" })],
      ["expired", () => token({}, { expiresIn: Math.floor(Date.now() / 1000) - 60 })],
      ["signed by another key", () => token({}, { key: otherKey })],
      ["not typ at+jwt", () => token({}, { typ: "JWT" })],
      ["not an Agent token", () => token({ claims: { type: "user" } })],
      ["no workspace", () => token({ claims: { workspace_id: undefined } })],
    ]) {
      test(`rejects a token that is ${name}`, async () => {
        const res = await call("/api/coforge/research/x", { bearer: await make() });
        assert.equal(res.status, 401);
        assert.match(res.headers.get("www-authenticate"), /error="invalid_token"/);
      });
    }

    test("rejects an unsigned (alg none) token", async () => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const forged = `${b64({ alg: "none", typ: "at+jwt" })}.${b64({ iss: ISSUER, aud: CLIENT_ID, sub: "a", type: "agent", workspace_id: "w1", scope: "openid", exp: 9999999999 })}.`;
      assert.equal((await call("/api/coforge/research/x", { bearer: forged })).status, 401);
    });
  });

  test("a token lacking the action's required scope gets 403 insufficient_scope", async () => {
    const emailAction = {
      name: "profile.email",
      effect: "read",
      idempotency: "safe",
      endpoint: { method: "GET", path: "/email" },
      required_scopes: ["email"],
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    };
    const strict = createApp(config, { keys, actions: [emailAction], handlers: { "profile.email": () => ({ status: 200, body: {} }) } });
    const ask = async (scope) =>
      strict.request(`${BASE}/api/coforge/email`, { headers: { authorization: `Bearer ${await token({ claims: { scope } })}` } });
    const denied = await ask("openid profile identity");
    assert.equal(denied.status, 403);
    assert.match(denied.headers.get("www-authenticate"), /insufficient_scope/);
    assert.equal((await ask("openid profile identity email")).status, 200);
  });

  test("validates input", async () => {
    const bearer = await token();
    const headers = { "idempotency-key": "k-invalid" };
    for (const body of [{}, { question: "" }, { question: "ok", extra: 1 }, { question: 5 }, { question: "x".repeat(4001) }]) {
      const res = await call("/api/coforge/research", { method: "POST", bearer, body, headers });
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
      assert.equal((await res.json()).error, "invalid_input");
    }
    const notJson = await app.request(`${BASE}/api/coforge/research`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "idempotency-key": "k", "content-type": "application/json" },
      body: "{nope",
    });
    assert.equal(notJson.status, 400);
    assert.equal((await call("/api/coforge/research/abc?extra=1", { bearer })).status, 400);
  });

  test("requires the idempotency header on research.start", async () => {
    const res = await call("/api/coforge/research", { method: "POST", bearer: await token(), body: { question: "q" } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "idempotency_key_required");
  });

  describe("research actions", () => {
    let fake;
    let handlers;
    let research;
    const start = (question = "固态电池的产业格局", key = "k1", claims = {}) =>
      token({ claims }).then((bearer) => call("/api/coforge/research", { method: "POST", bearer, body: { question }, headers: { "idempotency-key": key } }));
    const get = async (path, claims = {}) => call(`/api/coforge/research/${path}`, { bearer: await token({ claims }) });

    before(async () => {
      fake = await fakePiResearch();
    });
    after(() => fake.server.close());
    const fresh = (extra = {}) => {
      fake.state.studies.clear();
      fake.state.reports.clear();
      fake.state.starts = 0;
      fake.state.down = false;
      fake.state.rejectStart = false;
      const dataDir = mkdtempSync(join(tmpdir(), "coforge-app-"));
      const cfg = loadConfig({ ...env, PIRESEARCH_INTERNAL_URL: fake.url, COFORGE_APP_DATA_DIR: dataDir, ...extra });
      handlers = createResearchHandlers({ config: cfg, store: createRunStore(dataDir) });
      research = createApp(cfg, { keys, handlers });
      app = research;
      return { cfg, dataDir };
    };

    test("start, status and report", async () => {
      fresh();
      const started = await start();
      assert.equal(started.status, 202);
      const { run_id: runId, status, status_url: url } = await started.json();
      assert.equal(status, "running");
      assert.equal(url, `${BASE}/api/coforge/research/${runId}`);
      assert.equal(fake.state.studies.get(`sessions/${runId}/1`).question, "固态电池的产业格局");

      const info = await (await get(runId)).json();
      assert.deepEqual([info.status, info.progress], ["running", { tasks_total: 2, tasks_done: 1 }]);
      assert.ok(info.started_at);
      assert.equal((await get(`${runId}/report`)).status, 409);

      fake.state.studies.get(`sessions/${runId}/1`).status = "finished";
      fake.state.reports.set(`sessions/${runId}/1`, "# 报告\n正文");
      assert.equal((await (await get(runId)).json()).status, "completed");
      const report = await get(`${runId}/report`);
      assert.deepEqual(await report.json(), { run_id: runId, status: "completed", report_markdown: "# 报告\n正文", truncated: false });
    });

    test("a failed run reports its error and has no report", async () => {
      fresh();
      const { run_id: runId } = await (await start()).json();
      Object.assign(fake.state.studies.get(`sessions/${runId}/1`), { status: "failed", error: "没有找到模型密钥" });
      const info = await (await get(runId)).json();
      assert.deepEqual([info.status, info.error], ["failed", "没有找到模型密钥"]);
      assert.equal((await get(`${runId}/report`)).status, 409);
    });

    test("a report over the cap is truncated below 1 MiB", async () => {
      fresh();
      const { run_id: runId } = await (await start()).json();
      fake.state.studies.get(`sessions/${runId}/1`).status = "finished";
      fake.state.reports.set(`sessions/${runId}/1`, "报".repeat(400_000));
      const body = await (await get(`${runId}/report`)).json();
      assert.equal(body.truncated, true);
      assert.ok(Buffer.byteLength(body.report_markdown) < 1024 * 1024);
    });

    test("a Workspace cannot read another Workspace's run, nor one made in the web UI", async () => {
      fresh();
      const { run_id: runId } = await (await start()).json();
      fake.state.studies.set("sessions/20250101-000000/1", { id: "sessions/20250101-000000/1", status: "finished", created_at: "x", error: "" });
      assert.equal((await get(runId, { workspace_id: "w2" })).status, 404);
      assert.equal((await get(`${runId}/report`, { workspace_id: "w2" })).status, 404);
      assert.equal((await get("20250101-000000")).status, 404);
      assert.equal((await get("missing")).status, 404);
      assert.equal((await get(runId)).status, 200);
    });

    test("ownership survives a restart (file-backed)", async () => {
      const { cfg, dataDir } = fresh();
      const { run_id: runId } = await (await start()).json();
      const again = createApp(cfg, { keys, handlers: createResearchHandlers({ config: cfg, store: createRunStore(dataDir) }) });
      app = again;
      assert.equal((await get(runId)).status, 200);
      assert.equal((await get(runId, { workspace_id: "w2" })).status, 404);
    });

    test("the same key and input starts one run; different input is 422", async () => {
      fresh();
      const first = await (await start("同一个研究问题", "same")).json();
      const replay = await start("同一个研究问题", "same");
      assert.equal(replay.headers.get("idempotency-replayed"), "true");
      assert.deepEqual(await replay.json(), first);
      assert.equal(fake.state.starts, 1);
      assert.equal((await start("另一个研究问题", "same")).status, 422);
      assert.equal((await start("同一个研究问题", "same", { workspace_id: "w2" })).status, 202);
    });

    test("at most N runs per Workspace at once, then 429; a finished run frees a slot", async () => {
      fresh();
      assert.equal((await start("第一个问题", "a")).status, 202);
      assert.equal((await start("第二个问题", "b")).status, 202);
      const third = await start("第三个问题", "c");
      assert.equal(third.status, 429);
      assert.equal((await third.json()).error, "too_many_runs");
      assert.equal((await start("别的工作区的问题", "a", { workspace_id: "w2" })).status, 202);
      fake.state.studies.get("sessions/20260101-120000/1").status = "finished";
      assert.equal((await start("第三个问题", "c")).status, 202); // the 429 released its key
      assert.equal(fake.state.starts, 4);
    });

    test("parallel starts cannot pass the limit", async () => {
      fresh({ COFORGE_MAX_CONCURRENT_RUNS: "1" });
      const results = await Promise.all([start("并发问题一号", "p1"), start("并发问题二号", "p2"), start("并发问题三号", "p3")]);
      assert.deepEqual(results.map((r) => r.status).sort(), [202, 429, 429]);
    });

    test("PiResearch down: 502 and the key stays usable; a rejected question is 400", async () => {
      fresh();
      fake.state.down = true;
      const down = await start("研究问题", "d");
      assert.equal(down.status, 502);
      fake.state.down = false;
      assert.equal((await start("研究问题", "d")).status, 202);
      fake.state.rejectStart = true;
      assert.equal((await start("研究问题 2", "e")).status, 400);
    });
  });

  describe("request handling details", () => {
    const base = {
      effect: "create",
      endpoint: { method: "POST", path: "/slow" },
      idempotency: "key_required",
      idempotency_header: "Idempotency-Key",
      required_scopes: [],
      input_schema: { type: "object", properties: { n: { type: "integer" } }, required: ["n"], additionalProperties: false },
    };
    const post = (a, body, key) =>
      a.request(`${BASE}/api/coforge/slow`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearerPromise}`, "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(body),
      });
    let bearerPromise;
    before(async () => {
      bearerPromise = await token();
    });

    test("a duplicate that arrives while the first call runs gets 409, then the replay", async () => {
      let runs = 0;
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      const a = createApp(config, {
        keys,
        actions: [{ ...base, name: "slow.run" }],
        handlers: { "slow.run": async () => ((runs += 1), await gate, { status: 201, body: { ran: runs } }) },
      });
      const first = post(a, { n: 1 }, "same");
      await new Promise((r) => setTimeout(r, 20));
      const second = await post(a, { n: 1 }, "same");
      assert.equal(second.status, 409);
      assert.equal(second.headers.get("retry-after"), "1");
      release();
      assert.equal((await first).status, 201);
      const third = await post(a, { n: 1 }, "same");
      assert.equal(third.headers.get("idempotency-replayed"), "true");
      assert.equal(runs, 1);
    });

    test("a failed call releases its key so a retry can run", async () => {
      let runs = 0;
      const a = createApp(config, {
        keys,
        actions: [{ ...base, name: "slow.run" }],
        handlers: { "slow.run": async () => (++runs === 1 ? { status: 503, body: { error: "later" } } : { status: 201, body: {} }) },
      });
      assert.equal((await post(a, { n: 1 }, "retry")).status, 503);
      assert.equal((await post(a, { n: 1 }, "retry")).status, 201);
    });

    test("a body over the limit is refused, chunked or not", async () => {
      const a = createApp(config, { keys, actions: [{ ...base, name: "slow.run" }], handlers: { "slow.run": () => ({ status: 201, body: {} }) } });
      const big = JSON.stringify({ n: 1, pad: "x".repeat(70 * 1024) });
      assert.equal((await post(a, JSON.parse(big), "big")).status, 413);
      const chunked = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      });
      const res = await a.request(`${BASE}/api/coforge/slow`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearerPromise}`, "content-type": "application/json", "idempotency-key": "chunk" },
        body: chunked,
        duplex: "half",
      });
      assert.equal(res.status, 413);
    });

    test("GET query strings are coerced to the declared types", async () => {
      let seen;
      const a = createApp(config, {
        keys,
        actions: [{
          name: "q.get", effect: "read", endpoint: { method: "GET", path: "/q" }, idempotency: "safe", required_scopes: [],
          input_schema: {
            type: "object",
            properties: { limit: { type: "integer", minimum: 1 }, ratio: { type: "number" }, all: { type: "boolean" }, tags: { type: "array", items: { type: "string" } }, q: { type: "string" } },
            additionalProperties: false,
          },
        }],
        handlers: { "q.get": (input) => ((seen = input), { status: 200, body: {} }) },
      });
      const get = (qs) => a.request(`${BASE}/api/coforge/q?${qs}`, { headers: { authorization: `Bearer ${bearerPromise}` } });
      assert.equal((await get("limit=5&ratio=1.5&all=true&tags=a&tags=b&q=007")).status, 200);
      assert.deepEqual(seen, { limit: 5, ratio: 1.5, all: true, tags: ["a", "b"], q: "007" });
      for (const bad of ["limit=abc", "limit=0x10", "limit=1.5", "all=yes", "ratio=1e3", "limit=1&limit=2"]) {
        assert.equal((await get(bad)).status, 400, bad);
      }
    });
  });
});
