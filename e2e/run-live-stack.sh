#!/usr/bin/env bash
#
# Run the e2e suite against the real docker-compose stack — postgres, redis,
# rabbitmq, minio, backend (gunicorn, 2 workers), the SSE sidecar, the Celery
# worker and beat — plus a locally-run frontend dev server. Unlike
# e2e/run-constrained-ci.sh (which only boots postgres + bare gunicorn to
# reproduce the free GitHub runner's flakiness under a resource-starved
# container, ADR-030), this gives full infra fidelity: it's what
# 15-live-expedition.spec.ts / 16-story-live-layer.spec.ts need (Redis + the
# SSE sidecar + the worker), and it's a strict superset of what the act
# mirror covers for every other spec (the backend here also runs under
# gunicorn, so the same concurrency fix applies).
#
# This does NOT `docker compose down` afterwards — the stack it boots is the
# same one `docker compose up` gives you for normal dev, so it's left running.
# Only the frontend dev server this script starts is torn down on exit.
#
# The frontend runs on port 3002, not 3000 — the backend/SSE/Redis containers
# are shared with your normal dev stack (same containers, `docker compose up`
# is idempotent), but the frontend isn't containerized, so reusing 3000 would
# either collide with or `fuser -k` a frontend dev server you already have
# running for normal work.
#
# Prerequisite (one-time): `cd e2e && npm ci && npx playwright install --with-deps chromium`
#
# Usage:
#   e2e/run-live-stack.sh                       # full suite
#   e2e/run-live-stack.sh 15-live-expedition     # just one file (passthrough to `playwright test`)
set -euo pipefail

cd "$(dirname "$0")/.."

FRONTEND_PORT=3002

# The live/SSE endpoints (backend/Resources/live_resource.py _add_cors_headers)
# echo FRONTEND_URL back as Access-Control-Allow-Origin — EventSource enforces
# CORS even though the plain HTTP exchange itself succeeds, so a mismatch here
# doesn't show up as a request failure anywhere in the server logs: the browser
# just silently discards every response and EventSource's onerror retries
# forever. docker-compose.yml defaults FRONTEND_URL to :3000 for normal dev;
# export the real e2e port before `docker compose up` so backend/sse pick it up.
export FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

echo ">>> Bringing up the full docker-compose stack (postgres, redis, rabbitmq, minio, backend, sse, worker, beat)..."
# Not `--wait`: minio-init/migrate are one-shot containers that exit 0 on
# success, but `--wait` treats any exited container as a failure regardless
# of exit code, so it reports failure even on a fully healthy stack. Poll the
# two services that actually gate serving traffic instead.
docker compose up -d

echo ">>> Waiting for backend + sse sidecar to report healthy..."
for svc in backend sse; do
  cid=$(docker compose ps -q "$svc")
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid")" = "healthy" ]; do
    sleep 2
  done
done

FRONTEND_PID=""
cleanup() {
  if [ -n "$FRONTEND_PID" ]; then
    echo ">>> Stopping frontend dev server (pgid ${FRONTEND_PID})..."
    kill -- "-${FRONTEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# `next dev` locks per source directory (not per port) — a second `next dev` in this
# same checkout refuses to start while your normal one is running. Building + starting
# a production server sidesteps that lock; NEXT_DIST_DIR (next.config.ts) keeps its
# build output out of the `.next` dir your dev server is using.
echo ">>> Building frontend (isolated dist dir) for the e2e run..."
NEXT_DIST_DIR=.next-e2e pnpm --dir frontend build

echo ">>> Starting frontend production server on :${FRONTEND_PORT}..."
fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
PORT="${FRONTEND_PORT}" NEXT_DIST_DIR=.next-e2e setsid nohup pnpm --dir frontend start >/tmp/e2e-live-frontend.log 2>&1 &
FRONTEND_PID=$!

echo ">>> Waiting for frontend on :${FRONTEND_PORT}..."
npx --yes wait-on -t 60000 "http://localhost:${FRONTEND_PORT}" || { cat /tmp/e2e-live-frontend.log; exit 1; }

echo ">>> Running e2e suite against the live stack..."
cd e2e
E2E_BASE_URL="http://localhost:${FRONTEND_PORT}" npm test -- "$@"
