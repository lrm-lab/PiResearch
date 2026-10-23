import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Which Workspace started which run: a JSON file under the data directory, written atomically.
 * A run is invisible to every other Workspace. One process owns the file.
 * @param {string} dataDir
 */
export function createRunStore(dataDir) {
  const file = join(dataDir, "runs.json");
  /** @type {Record<string, { workspaceId: string, agentId: string, createdAt: string, done?: boolean }>} */
  let runs = {};
  try {
    runs = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // first start
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(runs));
    renameSync(`${file}.tmp`, file);
  };
  return {
    add(runId, workspaceId, agentId) {
      runs[runId] = { workspaceId, agentId, createdAt: new Date().toISOString() };
      save();
    },
    /** The run, only when `workspaceId` started it. */
    get: (runId, workspaceId) => (Object.hasOwn(runs, runId) && runs[runId].workspaceId === workspaceId ? runs[runId] : undefined),
    /** Run ids of a Workspace not yet seen finished. */
    active: (workspaceId) => Object.entries(runs).filter(([, r]) => r.workspaceId === workspaceId && !r.done).map(([id]) => id),
    markDone(runId) {
      if (Object.hasOwn(runs, runId) && !runs[runId].done) {
        runs[runId].done = true;
        save();
      }
    },
    forget(runId) {
      delete runs[runId];
      save();
    },
  };
}
