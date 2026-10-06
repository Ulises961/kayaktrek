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

# Maintenance mode (M33 WP1): nginx on the box answers 503 plus a static page for app./api./
# live. while this flag file exists, so a visitor mid-deploy sees an honest page instead of a
# connection error. DEPLOY_MAINTENANCE=0 skips it, for a box whose nginx has not been given
# the flag check yet (DEPLOY.md "Maintenance mode"). The flag directory is checked up front,
# so a half-installed box fails before anything changes rather than deploying with no page.
readonly MAINTENANCE="${DEPLOY_MAINTENANCE:-1}"
readonly MAINTENANCE_FLAG="${DEPLOY_MAINTENANCE_FLAG:-/var/www/kayak-maintenance/maintenance.flag}"

drop_maintenance() {
    # Runs on every exit, success or not: a deploy that dies halfway must not leave the site
    # bricked behind a maintenance page. If this ssh cannot connect either, the flag survives;
    # DEPLOY.md gives the one-line manual removal.
    if [ "$MAINTENANCE" = "1" ]; then
        ssh "$HOST" "rm -f ${MAINTENANCE_FLAG}" || echo "WARNING: could not remove ${MAINTENANCE_FLAG} on ${HOST} — remove it by hand" >&2
    fi
}

if [ "$MAINTENANCE" = "1" ]; then
    ssh "$HOST" "[ -d \"\$(dirname ${MAINTENANCE_FLAG})\" ]" || {
        echo "ERROR: $(dirname "$MAINTENANCE_FLAG") does not exist on ${HOST}." >&2
        echo "  Install the maintenance page first (DEPLOY.md \"Maintenance mode\")," >&2
        echo "  or deploy without it: DEPLOY_MAINTENANCE=0 $0" >&2
        exit 2
    }
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
#
# The flag's blast radius is the *project*, not the file: until 2026-09-20 it also deleted
# the operator tooling, because docker-compose.monitoring.yml shared this stack's
# directory-derived project name and so looked like a pile of orphans on every deploy. That
# file now sets `name: kayak-monitoring`. Keep it that way — if a third compose file is ever
# added beside these, give it its own `name:` before the first deploy runs, not after.
#
# `pull` runs BEFORE the flag goes up: it is the slow, network-bound step and changes
# nothing that is serving, so visitors only see the maintenance page for the swap itself.
ssh "$HOST" "
    set -e
    cd ${REMOTE_PATH}
    KAYAK_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.prod.yml pull
"

if [ "$MAINTENANCE" = "1" ]; then
    trap drop_maintenance EXIT
    echo ">>> Maintenance mode ON (${MAINTENANCE_FLAG})"
    ssh "$HOST" "touch ${MAINTENANCE_FLAG}"
fi

readonly SWAP_STARTED_AT="$SECONDS"
ssh "$HOST" "
    set -e
    cd ${REMOTE_PATH}
    KAYAK_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.prod.yml up -d --remove-orphans
"

echo ">>> [3/3] Health check"
# Poll rather than sleep-then-check: containers were just (re)created and the backend takes
# a moment to bind before /health answers, so a single early check reports a false failure,
# and a fixed pause either wastes time or is still too short. Up to 90s; the elapsed time is
# the swap window M33 WP0 wants measured, so it is printed rather than discarded.
# `curl` hits the backend's own port, not nginx, so this works with the flag still up.
ssh "$HOST" "
    cd ${REMOTE_PATH}
    for attempt in \$(seq 1 45); do
        if curl -sf http://localhost:5000/api/v1/health >/dev/null \
            && curl -sf -o /dev/null http://localhost:3300/; then
            exit 0
        fi
        sleep 2
    done
    docker compose -f docker-compose.prod.yml ps
    exit 1
" || { echo "ERROR: backend and frontend were not both answering within 90s" >&2; exit 1; }
ssh "$HOST" "cd ${REMOTE_PATH} && docker compose -f docker-compose.prod.yml ps"
echo ">>> Backend and frontend answering $((SECONDS - SWAP_STARTED_AT))s after the swap began."

if [ "$MAINTENANCE" = "1" ]; then
    drop_maintenance
    trap - EXIT
    echo ">>> Maintenance mode OFF"
fi

echo ">>> Done. Deployed ${IMAGE_TAG} to ${HOST}."
