# syntax=docker/dockerfile:1

# ---------- stage 1: build the galaxy 3D frontend ----------
FROM node:22-slim AS galaxy
RUN npm install -g pnpm@9
WORKDIR /build/galaxy
COPY galaxy/package.json galaxy/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY galaxy/ ./
RUN pnpm build

# ---------- stage 2: build the prism 3D frontend ----------
FROM node:22-slim AS prism
RUN npm install -g pnpm@9
WORKDIR /build/prism
COPY prism/package.json prism/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY prism/ ./
RUN pnpm build

# ---------- stage 3: python runtime ----------
FROM python:3.12-slim AS app

# WeasyPrint (report PDF export) needs Pango; fonts-noto-cjk keeps Chinese text from rendering as
# tofu. constellation/pdf.py degrades to 501 when the module is absent, so a slim dev image keeps
# working.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libfontconfig1 fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONPATH=/app:/app/FrontierAgent \
    RUNS_DIR=/data/runs

WORKDIR /app

# FrontierAgent is a uv project; the venv lands at /app/FrontierAgent/.venv,
# which is exactly where constellation.home.job_interpreter looks for it.
COPY FrontierAgent/ ./FrontierAgent/
RUN cd FrontierAgent && uv sync --frozen --no-dev --extra eval

# Report PDF export (POST /api/report.pdf). System Python, not the FrontierAgent venv.
RUN uv pip install --system --no-cache "weasyprint==70.0"

# The 2D viewer + homepage server.
COPY constellation/ ./constellation/
COPY conftest.py ./

# The built 3D bundles and the stdlib reverse proxy.
COPY --from=galaxy /build/galaxy/dist ./galaxy/dist
COPY --from=prism /build/prism/dist ./prism/dist
COPY galaxy/serve.py ./galaxy/serve.py

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8766
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
