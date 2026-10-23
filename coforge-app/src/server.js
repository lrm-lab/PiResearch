import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MANIFEST_PATH } from "./manifest.js";
import { createRunStore } from "./runs.js";
import { createResearchHandlers } from "./research.js";

const config = loadConfig();
if (!config) {
  // COFORGE_ISSUER is unset: the feature is off. Stay up (the container is not restart-looped) and answer 404.
  const port = Number(process.env.PORT || 3000);
  createServer((_req, res) => {
    res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not_found","message":"CoForge App is not configured"}');
  }).listen(port, () => console.log(`coforge-app is off (COFORGE_ISSUER unset); answering 404 on port ${port}`));
} else {
  const handlers = createResearchHandlers({ config, store: createRunStore(config.dataDir) });
  serve({ fetch: createApp(config, { handlers }).fetch, port: config.port }, ({ port }) => {
    console.log(`coforge-app listening on port ${port}`);
    console.log(`Manifest: ${config.appOrigin}${MANIFEST_PATH}`);
  });
}
