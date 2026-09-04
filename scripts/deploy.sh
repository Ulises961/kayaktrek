#!/usr/bin/env bash
#
# One-shot deploy: sync the config set to the box, then pull and start the app stack.
#
# Wraps `deploy-sync.sh` (the sync step) followed by the two `docker compose` commands
# DEPLOY.md's "Deploying (every time)" section otherwise has you type by hand over a
# second ssh session — this is exactly that runbook, scripted so nothing in it is
# forgotten or fat-fingered.
#
#   DEPLOY_HOST=user@box ./scripts/deploy.sh                        # deploy :latest
#   DEPLOY_HOST=user@box KAYAK_IMAGE_TAG=v0.8.0 ./scripts/deploy.sh  # pin a version
#   DEPLOY_HOST=user@box ./scripts/deploy.sh --dry-run               # sync preview only
#
# Does not touch nginx or the monitoring stack (docker-compose.monitoring.yml) — both are
# deliberately outside the automated push, see deploy-sync.sh and DEPLOY.md.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

readonly HOST="${DEPLOY_HOST:-}"
readonly REMOTE_PATH="${DEPLOY_PATH:-~/docker-containers/kayak-planner}"
readonly IMAGE_TAG="${KAYAK_IMAGE_TAG:-latest}"

if [ -z "$HOST" ]; then
    echo "ERROR: DEPLOY_HOST is not set (e.g. DEPLOY_HOST=ulises@box)" >&2
    echo "  Usage: DEPLOY_HOST=user@host $0 [--dry-run]" >&2
    exit 2
fi

if [ "${1:-}" = "--dry-run" ]; then
    echo ">>> --dry-run: sync preview only, no pull/up will run."
    "$REPO_DIR/scripts/deploy-sync.sh" --dry-run
    exit 0
fi

echo ">>> [1/3] Syncing the deploy set to ${HOST}:${REMOTE_PATH}"
"$REPO_DIR/scripts/deploy-sync.sh"

echo ">>> [2/3] Pulling ${IMAGE_TAG} and starting the stack"
# --remove-orphans matters whenever a service is deleted from the compose file: without
# it, `up -d` starts and updates what the file names and silently leaves anything it no
# longer names still running — the file on the box would be current while the box itself
# was not. See deploy-sync.sh's trailing comment for the MinIO-removal incident this
# guards against. `migrate` re-runs `alembic upgrade head && flask seed` on every `up`;
# both are idempotent, so this is safe on every deploy, not just the first one.
ssh "$HOST" "
    set -e
    cd ${REMOTE_PATH}
    KAYAK_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.prod.yml pull
    KAYAK_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.prod.yml up -d --remove-orphans
"

echo ">>> [3/3] Health check"
# A short pause before checking: containers were just (re)created and the backend takes a
# moment to bind before /health answers — checking instantly would report a false failure
# on every deploy rather than the stack's actual state a few seconds later.
ssh "$HOST" "
    sleep 5
    cd ${REMOTE_PATH}
    docker compose -f docker-compose.prod.yml ps
    curl -sf http://localhost:5000/api/v1/health && echo
"

echo ">>> Done. Deployed ${IMAGE_TAG} to ${HOST}."
