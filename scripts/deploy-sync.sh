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
	systemd/kayak-backup.service.template
	systemd/kayak-backup.timer
)

# nginx is deliberately NOT here. `nginx/kayak-expedition-planner.conf.template` is a
# template full of `kayak.example.com` placeholders that must be substituted per box, and
# an earlier version of this script both synced it and printed a `sudo cp` of it into
# /etc/nginx/sites-available/ — which overwrote a live, correct config with placeholders.
# Host-level config that needs substitution and root does not belong in an automated push;
# it changes about once a year and is a deliberate, sighted operation when it does. See
# DEPLOY.md.
#
# `systemd/` IS in the list above, and the distinction against nginx is worth being precise
# about, because this comment previously claimed the opposite and the code had moved on.
# Both are templates needing substitution and root to install. The difference is *where the
# push lands*: these two arrive in the deploy directory, which is simply where you `sudo cp`
# them from — nothing reads them there, so a stale copy is inert. The nginx template's
# hazard was that an earlier script printed a `sudo cp` into sites-available alongside the
# sync, which is what overwrote a live config.
#
# The rule this leaves behind: this script pushes files into the deploy directory and
# nothing else. What root installs *out* of that directory — nginx vhost, systemd units — is
# a separate, sighted, once-in-a-long-while operation. See DEPLOY.md.

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

# Does the remote path exist yet? Asked explicitly, before rsync gets a chance to fail on
# it, because on a box that has never been synced rsync exits 3 with
#   change_dir "…/kayak-planner" failed: No such file or directory
# and preview() above would report that as "could not reach ${HOST}" — naming the one cause
# that is definitely not true. A first run against a fresh box is exactly when --dry-run is
# most worth having and least worth misreading; that is how the M21 DigitalOcean migration
# hit it.
#
# The real push creates the directory itself (below), so only --dry-run was ever affected.
# Fixed by asking rather than by inferring from rsync's exit code: 3 covers several
# "selecting input/output files" conditions and its message text is not a stable contract.
#
# ssh returns 255 for its own failures and otherwise the remote command's status, so
# `test -d` cleanly separates the three cases. REMOTE_PATH is intentionally unquoted in the
# remote command so the remote shell expands its leading ~.
#
# Written as `if ssh …` rather than running ssh and inspecting $? on the next line: this
# script runs under `set -e`, which would abort on the non-zero exit that means "directory
# absent" before anything got the chance to interpret it. A condition is a tested context,
# so the failure is ours to handle.
if ssh "$HOST" "test -d ${REMOTE_PATH}"; then
    REMOTE_EXISTS=1
else
    SSH_STATUS=$?
    if [ "$SSH_STATUS" = "1" ]; then
        REMOTE_EXISTS=0
    else
        echo "ERROR: could not reach ${HOST} over ssh (exit ${SSH_STATUS})" >&2
        exit 1
    fi
fi
readonly REMOTE_EXISTS

echo ">>> Changes to ${HOST}:${REMOTE_PATH}/"
if [ "$REMOTE_EXISTS" = "0" ]; then
    # Nothing to diff against: every file is new. List them rather than erroring, so a
    # first run still answers "what is about to land on this box?".
    echo "    (first run — ${REMOTE_PATH} does not exist yet; all of this is new)"
    printf '    %s\n' "${FILES[@]}"
    echo "    ${ENV_SOURCE} -> .env"
else
    # The same --chmod the real push uses, below. Without it the preview compares local
    # modes against modes the push itself set, so every file reports a spurious `p`
    # difference forever and "(nothing — the box already matches)" is unreachable. A tool
    # whose whole job is answering "is what is on the box what is in the repo?" must not
    # report permanent phantom drift; the preview has to model the push, not a push nobody
    # performs.
    CHANGES=$(preview --relative --chmod=F755 --omit-dir-times "${FILES[@]}" "${HOST}:${REMOTE_PATH}/")
    ENV_CHANGE=$(preview --chmod=F600 "$ENV_SOURCE" "${HOST}:${REMOTE_PATH}/.env")

    if [ -z "$CHANGES" ] && [ -z "$ENV_CHANGE" ]; then
        echo "    (nothing — the box already matches this checkout)"
    else
        [ -n "$CHANGES" ] && echo "$CHANGES" | sed 's/^/    /'
        # The env file's *content* is never shown; only that it differs.
        [ -n "$ENV_CHANGE" ] && echo "    ${ENV_SOURCE} -> .env  (differs)"
    fi
fi

if [ "$DRY_RUN" = "1" ]; then
    echo ">>> --dry-run: nothing was copied."
    exit 0
fi

echo ">>> Pushing..."
ssh "$HOST" "mkdir -p ${REMOTE_PATH}/scripts"
rsync -az --relative --chmod=F755 --omit-dir-times "${FILES[@]}" "${HOST}:${REMOTE_PATH}/"

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
