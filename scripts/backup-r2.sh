#!/usr/bin/env bash
#
# Offsite copy of R2 object storage (photos, avatars, documents) into the same B2 bucket
# `backup-db.sh` already writes to — a separate prefix, not a separate bucket, so there is
# one B2 credential and one lifecycle policy to reason about instead of two.
#
# `rclone copy`, not `sync`: this protects against losing the R2/Cloudflare account itself,
# not against an accidental delete inside R2 — `copy` never removes anything at the B2 side,
# so a delete in R2 (accidental or malicious) does not propagate into the one place a
# deleted object could still be recovered from. `--update` skips objects whose size and
# mtime already match, so a nightly run after the first is an incremental cost, not a full
# re-upload of the whole library.
#
# Deliberately NOT per-object encrypted, unlike backup-db.sh's Postgres dump: this is a
# mirror of R2 into a private B2 bucket reachable only by the same restricted application
# key `backup-db.sh` uses, not a plaintext dump of every account leaving the app's control.
# The public bucket's contents are already public by definition (`is_public`-flagged photos);
# the private bucket (documents, avatars) is sensitive but not the "every account, trip and
# float plan" blast radius the database backup exists to contain.
#
# Run from the HOST's cron/systemd, same as backup-db.sh, for the same reason: a backup that
# depends on the application stack being healthy is not one you can trust on the day it isn't.
#
# Exit codes: 0 success, non-zero on any failure.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

require_var() {
	if [ -z "${!1:-}" ]; then
		echo "ERROR: $1 is not set (expected in $REPO_DIR/.env)" >&2
		exit 2
	fi
}

require_var BACKUP_B2_ENDPOINT
require_var BACKUP_B2_KEY_ID
require_var BACKUP_B2_APPLICATION_KEY
require_var BACKUP_B2_BUCKET
require_var STORAGE_ENDPOINT
require_var STORAGE_ACCESS_KEY
require_var STORAGE_SECRET_KEY

if ! command -v rclone >/dev/null 2>&1; then
	echo "ERROR: 'rclone' is not installed. On Ubuntu: sudo apt install rclone" >&2
	exit 2
fi

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

# --- B2 remote — same credentials and backend choice as backup-db.sh ---------------
export RCLONE_CONFIG_B2_TYPE=s3
export RCLONE_CONFIG_B2_PROVIDER=Other
export RCLONE_CONFIG_B2_ENDPOINT="$BACKUP_B2_ENDPOINT"
export RCLONE_CONFIG_B2_ACCESS_KEY_ID="$BACKUP_B2_KEY_ID"
export RCLONE_CONFIG_B2_SECRET_ACCESS_KEY="$BACKUP_B2_APPLICATION_KEY"
export RCLONE_S3_NO_CHECK_BUCKET=true

# --- R2 remote --------------------------------------------------------------------
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Other
export RCLONE_CONFIG_R2_ENDPOINT="$STORAGE_ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY"

# Same fallback rule as backend/Services/storage_service.py: both default to a single
# bucket when the public/private split isn't configured.
readonly BASE_BUCKET="${STORAGE_BUCKET:-kayak}"
readonly PUBLIC_BUCKET="${STORAGE_BUCKET_PUBLIC:-$BASE_BUCKET}"
readonly PRIVATE_BUCKET="${STORAGE_BUCKET_PRIVATE:-$BASE_BUCKET}"

# Dedupe: a single-bucket deployment (the common case here) would otherwise copy the same
# bucket twice under two different destination prefixes.
declare -A seen=()
BUCKETS=()
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
	if [ -z "${seen[$b]:-}" ]; then
		BUCKETS+=("$b")
		seen[$b]=1
	fi
done

for bucket in "${BUCKETS[@]}"; do
	dest="B2:${BACKUP_B2_BUCKET}/r2-objects/${bucket}"
	log "copying R2:${bucket} -> ${dest}"
	rclone copy "R2:${bucket}" "$dest" --update --stats-one-line -v
done

log "OK — R2 objects mirrored to B2"
