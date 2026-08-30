#!/usr/bin/env bash
#
# Push the deploy set from this machine to the server. Run BEFORE `docker compose pull`.
#
# Replaces copying files across by hand, which is what produced two outages: a
# docker-compose.prod.yml that predated the R2 wiring (so `migrate` ran with no STORAGE_*
# environment and refused, correctly, to rewrite every stored object URL against a dead
# host), and a .env that predated STORAGE_SECRET_KEY becoming required (so the stack would
# not start at all).
#
# Neither was a hard problem to fix; both were invisible until something crashed, because
# nothing could answer "is what is on the box what is in the repo?". This pushes the whole
# set every time, so a subset cannot go stale. The remaining failure mode is forgetting to
# run it — one thing to remember, rather than a judgement per file per release.
#
# Nothing here is encrypted at rest: SSH already encrypts in transit and the files land on
# a machine you control. The backup dumps ARE encrypted (scripts/backup-db.sh) because
# those go to a third party. That is the whole difference.
#
#   DEPLOY_HOST=ulises@box ./scripts/deploy-sync.sh --dry-run   # show what would change
#   DEPLOY_HOST=ulises@box ./scripts/deploy-sync.sh             # push it

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

readonly HOST="${DEPLOY_HOST:-}"
readonly REMOTE_PATH="${DEPLOY_PATH:-~/docker-containers/kayak-planner}"
readonly ENV_SOURCE="${DEPLOY_ENV_FILE:-.env.prod}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

if [ -z "$HOST" ]; then
    echo "ERROR: DEPLOY_HOST is not set (e.g. DEPLOY_HOST=ulises@box)" >&2
    echo "  Usage: DEPLOY_HOST=user@host $0 [--dry-run]" >&2
    exit 2
fi
command -v rsync >/dev/null 2>&1 || { echo "ERROR: rsync is not installed" >&2; exit 2; }
[ -f "$ENV_SOURCE" ] || { echo "ERROR: $ENV_SOURCE not found" >&2; exit 2; }

# Everything the box needs from this repo. Add to this list rather than copying something
# by hand — a file that is not here is a file that will silently drift.
readonly FILES=(
    docker-compose.prod.yml
    scripts/backup-db.sh
    scripts/restore-db.sh
)

# nginx is deliberately NOT here. `nginx/kayak-expedition-planner.conf.template` is a
# template full of `kayak.example.com` placeholders that must be substituted per box, and
# an earlier version of this script both synced it and printed a `sudo cp` of it into
# /etc/nginx/sites-available/ — which overwrote a live, correct config with placeholders.
# Host-level config that needs substitution and root does not belong in an automated push;
# it changes about once a year and is a deliberate, sighted operation when it does. See
# DEPLOY.md.
#
# `systemd/` is excluded on exactly the same grounds: kayak-backup.service.template carries
# __USER__/__REPO_DIR__ placeholders, lands in /etc/systemd/system/, and needs a
# daemon-reload to take effect. Syncing it would reintroduce the nginx mistake in a place
# where the damage is quieter — a clobbered unit does not fail the push, it just stops
# taking backups.
#
# The rule this leaves behind: what this script pushes is what the containers read. What
# root installs once, by hand, stays out.

for f in "${FILES[@]}"; do
    [ -f "$f" ] || { echo "ERROR: $f is missing from the repo" >&2; exit 1; }
done

# --itemize-changes on a dry run first, always — the point is to SEE the drift being
# corrected, not just to correct it. A long list after a quiet week is worth reading.
# `|| true` here would be wrong: rsync exits non-zero for an unreachable host just as it
# does for nothing-to-do, so swallowing the status reports a connection failure as if the
# box had drifted. Fail loudly instead — "cannot reach the server" and "the server is out
# of date" call for completely different actions.
preview() {
    local out status
    out=$(rsync -az --itemize-changes --dry-run "$@" 2>&1)
    status=$?
    if [ $status -ne 0 ]; then
        echo "ERROR: rsync could not reach ${HOST} (exit ${status}):" >&2
        echo "$out" | sed 's/^/  /' >&2
        exit 1
    fi
    echo "$out"
}

echo ">>> Changes to ${HOST}:${REMOTE_PATH}/"
CHANGES=$(preview --relative "${FILES[@]}" "${HOST}:${REMOTE_PATH}/")
ENV_CHANGE=$(preview "$ENV_SOURCE" "${HOST}:${REMOTE_PATH}/.env")

if [ -z "$CHANGES" ] && [ -z "$ENV_CHANGE" ]; then
    echo "    (nothing — the box already matches this checkout)"
else
    [ -n "$CHANGES" ] && echo "$CHANGES" | sed 's/^/    /'
    # The env file's *content* is never shown; only that it differs.
    [ -n "$ENV_CHANGE" ] && echo "    ${ENV_SOURCE} -> .env  (differs)"
fi

if [ "$DRY_RUN" = "1" ]; then
    echo ">>> --dry-run: nothing was copied."
    exit 0
fi

echo ">>> Pushing..."
ssh "$HOST" "mkdir -p ${REMOTE_PATH}/scripts"
rsync -az --relative --chmod=F755 "${FILES[@]}" "${HOST}:${REMOTE_PATH}/"

# .env last and separately: different name, and 600 because it holds every credential the
# stack has. --chmod applies on the receiving side regardless of the local mode.
rsync -az --chmod=F600 "$ENV_SOURCE" "${HOST}:${REMOTE_PATH}/.env"

echo ">>> Done."

cat <<EOF

Next, on the box:
    cd ${REMOTE_PATH}
    KAYAK_IMAGE_TAG=vX.Y.Z docker compose -f docker-compose.prod.yml pull
    KAYAK_IMAGE_TAG=vX.Y.Z docker compose -f docker-compose.prod.yml up -d --remove-orphans

--remove-orphans matters whenever a service is deleted from the compose file: without it
\`up -d\` starts and updates what the file names and silently leaves anything it no longer
names still running. That is the same class of drift this script exists to prevent — the
file on the box would be current while the box itself was not. It bit on the MinIO removal
(kayak_minio and kayak_minio_init would have kept running against a bind mount nothing
reads any more), and it is the correct default here in any case, because this script pushes
the whole deploy set every time and the compose file is the source of truth for what runs.
EOF
