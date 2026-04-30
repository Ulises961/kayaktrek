FROM python:3.12-slim AS base

# System deps required by psycopg2, GeoAlchemy2, and python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- dependency layer (rebuilt only when requirements.txt or setup.py change) ---
FROM base AS builder
COPY requirements.txt setup.py ./
# Install all deps + the project itself in editable mode so intra-project imports resolve
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir -e .

# --- runtime image ---
FROM base AS runtime

# Copy installed packages and console scripts from the builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN useradd -m appuser
USER appuser

WORKDIR /app
COPY --chown=appuser:appuser . .

EXPOSE 5000

ENTRYPOINT ["sh", "entrypoint.sh"]
