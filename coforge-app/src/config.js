/**
 * @typedef {{
 *   issuer: string, clientId: string, appOrigin: string, port: number,
 *   piresearchUrl: string, dataDir: string, maxConcurrentRuns: number, docsUrl?: string,
 * }} Config
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Config | null} null when COFORGE_ISSUER is unset: the feature is off.
 */
export function loadConfig(env = process.env) {
  if (!env.COFORGE_ISSUER?.trim()) return null;
  const need = (name) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
    return value;
  };
  const issuer = need("COFORGE_ISSUER");
  const appOrigin = need("APP_ORIGIN");
  const piresearchUrl = need("PIRESEARCH_INTERNAL_URL");
  if (issuer.endsWith("/")) throw new Error("COFORGE_ISSUER must not end with a slash");
  for (const [name, value] of [["COFORGE_ISSUER", issuer], ["APP_ORIGIN", appOrigin]]) {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      throw new Error(`${name} must be https (http is accepted only for localhost)`);
    }
  }
  if (new URL(appOrigin).pathname !== "/") throw new Error("APP_ORIGIN must be an origin, without a path");
  const maxConcurrentRuns = Number(env.COFORGE_MAX_CONCURRENT_RUNS || 2);
  if (!Number.isInteger(maxConcurrentRuns) || maxConcurrentRuns < 1) {
    throw new Error("COFORGE_MAX_CONCURRENT_RUNS must be a positive integer");
  }
  return {
    issuer,
    clientId: need("COFORGE_CLIENT_ID"),
    appOrigin: appOrigin.replace(/\/$/, ""),
    port: Number(env.PORT || 3000),
    piresearchUrl: piresearchUrl.replace(/\/$/, ""),
    dataDir: env.COFORGE_APP_DATA_DIR?.trim() || "./data",
    maxConcurrentRuns,
    docsUrl: env.COFORGE_DOCS_URL?.trim() || "https://github.com/lrm-lab/PiResearch/blob/main/coforge-app/README.md",
  };
}
