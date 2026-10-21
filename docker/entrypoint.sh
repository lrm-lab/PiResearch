#!/usr/bin/env bash
set -euo pipefail

runs_dir="${RUNS_DIR:-/data/runs}"
host="${HOST:-0.0.0.0}"
port="${PORT:-8766}"
mkdir -p "$runs_dir"

# constellation serves the 2D pages, the API and the research jobs' output.
python -m constellation.serve --home "$runs_dir" --host 127.0.0.1 --port 8765 &
constellation_pid=$!

# galaxy serves the built bundle under /galaxy/ and proxies everything else
# (the 2D pages and /api/*) to the constellation server above.
python galaxy/serve.py --upstream http://127.0.0.1:8765 --host "$host" --port "$port" &
galaxy_pid=$!

shutdown() {
  kill -TERM "$constellation_pid" "$galaxy_pid" 2>/dev/null || true
  wait "$constellation_pid" "$galaxy_pid" 2>/dev/null || true
}
trap shutdown INT TERM

wait -n "$constellation_pid" "$galaxy_pid" || true
shutdown
