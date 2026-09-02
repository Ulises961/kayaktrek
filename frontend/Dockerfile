FROM node:22-slim AS base
RUN corepack enable

# --- dependency + build layer (deps rebuilt only when package.json/pnpm-lock.yaml change) ---
FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time — there is no
# runtime equivalent for a self-hosted image, unlike a server-only env var.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SSE_URL
# Medical notes, parked 2026-09-02 (docs/adr/safety-privacy.md). Unset here on purpose, so
# an image built without deciding anything ships the feature hidden. Unparking is passing
# `true` as a build arg from _release-publish-run.yml — it cannot be a runtime toggle,
# since the value is inlined into the client bundle above.
ARG NEXT_PUBLIC_MEDICAL_NOTES
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SSE_URL=${NEXT_PUBLIC_SSE_URL} \
    NEXT_PUBLIC_MEDICAL_NOTES=${NEXT_PUBLIC_MEDICAL_NOTES} \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# --- runtime image ---
FROM base AS runtime

RUN useradd -m appuser
WORKDIR /app

# output: "standalone" (next.config.ts) traces only each route's actual dependency
# subset into .next/standalone plus a minimal server.js — no node_modules needed here.
COPY --from=builder --chown=appuser:appuser /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static

USER appuser
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
