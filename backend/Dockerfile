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
USER appuser

WORKDIR /app
COPY --chown=appuser:appuser . .

EXPOSE 5000

ENTRYPOINT ["sh", "entrypoint.sh"]
