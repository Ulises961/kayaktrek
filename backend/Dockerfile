FROM python:3.12-slim AS base

# System deps required by psycopg2, GeoAlchemy2, and python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# --- dependency layer (rebuilt only when pyproject.toml or uv.lock change) ---
FROM base AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app

# Install deps without the project first — leverages Docker layer cache
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Install the project itself in editable mode so intra-project imports resolve
COPY . .
RUN uv sync --frozen --no-dev

# --- runtime image ---
FROM base AS runtime

COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

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
