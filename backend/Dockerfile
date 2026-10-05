FROM python:3.12-slim AS base

# libmagic1 is python-magic's shared library, loaded at runtime. No compiler or libpq
# headers: every dependency installs from a prebuilt wheel (psycopg2-binary bundles its own
# libpq), and gcc + libpq-dev were ~200 MB of the runtime image. A dependency that ever
# needs building from source should get a builder-stage-only install, not this layer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# --- dependency layer (rebuilt only when pyproject.toml or uv.lock change) ---
FROM base AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app

# Install deps without the project first — leverages Docker layer cache
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project \
    # Packages' own bundled test suites (~24 MB), never imported at runtime.
    && find /app/.venv -type d \( -name tests -o -name test \) -prune -exec rm -rf {} +

# Install the project itself in editable mode so intra-project imports resolve
COPY . .
RUN uv sync --frozen --no-dev

# --- runtime image ---
FROM base AS runtime

COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# busybox for the compose healthchecks' `busybox wget`: one package, ~0.9 MB, against ~14 MB
# (22 packages) for curl or ~12 MB for Debian's wget. A healthcheck every 10s that starts
# the venv's Python instead scans all of site-packages each time.
RUN apt-get update && apt-get install -y --no-install-recommends busybox \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m appuser

# Cache directories for the decompressed land mask (Services/Utils/land_mask.py) and the
# proxied map tiles (Services/tile_cache.py), created here rather than at runtime for an
# ownership reason: a named volume mounted over a path that exists in the image inherits
# that path's ownership, while one mounted over a path that does not is created root-owned
# — and this process runs as appuser, so the first write would fail. Creating them empty
# and appuser-owned is what makes those volumes writable.
# Not VOLUME instructions: whether either is persisted is the compose file's decision, and
# an unmounted container must still work — the land mask re-decompresses (~2s, once per
# start) and the tile cache simply starts cold.
RUN mkdir -p /var/cache/kayak/land-mask /var/cache/kayak/tiles \
    && chown -R appuser:appuser /var/cache/kayak

USER appuser

WORKDIR /app
COPY --chown=appuser:appuser . .

EXPOSE 5000

ENTRYPOINT ["sh", "entrypoint.sh"]
