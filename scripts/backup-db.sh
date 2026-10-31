#!/usr/bin/env bash
#
# Nightly encrypted offsite database backup.
#
# Dumps Postgres, compresses, encrypts to an age public key, and uploads to Backblaze B2.
# Intended to run from the HOST's cron, not from Celery beat: a backup that depends on the
# application stack being healthy is exactly the backup you cannot take on the day the
# application stack is not healthy.
#
# Why encrypted, and why asymmetric: the dump carries every account, trip and float plan.
# Medical notes stay E2E-encrypted inside it (that ciphertext needs the user's own key),
# but everything else is plaintext. `age -r <public key>` means this box holds only the
# PUBLIC half — it can write backups it cannot itself read, so a compromised server does
# not hand over the backup history with it. The private key lives in a password manager,
# never on this machine. Lose it and the backups are unrecoverable: that is the trade.
#
# Why there is no pruning here: retention is a B2 *lifecycle rule* on the bucket, applied
# server-side. That keeps this script's credential delete-incapable, so a compromised box
# cannot erase the backup history — which is the attack the whole exercise guards against.
# See DEPLOY.md for the lifecycle rule and the key-application settings.
#
# Exit codes: 0 success, non-zero on any failure (cron will mail the output to the local
# user; there is deliberately no app-level alerting yet — see the conventions doc's alerting item).

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# --- config ------------------------------------------------------------------------
# Read from the repo-root .env, the same file docker compose uses. Sourced rather than
# exported per-variable so a cron environment with almost nothing in it still works.
if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

: "${POSTGRES_USER:=kayak}"
: "${POSTGRES_DB:=kayak_prod}"
: "${BACKUP_RETAIN_LOCAL:=0}"

require_var() {
	if [ -z "${!1:-}" ]; then
		echo "ERROR: $1 is not set (expected in $REPO_DIR/.env)" >&2
		exit 2
	fi
}

require_var BACKUP_AGE_RECIPIENT
require_var BACKUP_B2_ENDPOINT
require_var BACKUP_B2_KEY_ID
require_var BACKUP_B2_APPLICATION_KEY
require_var BACKUP_B2_BUCKET

for tool in age rclone docker; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "ERROR: '$tool' is not installed. On Ubuntu: sudo apt install age rclone" >&2
		exit 2
	fi
done

# --- rclone remote, configured entirely from the environment -----------------------
# No rclone.conf on disk: one place for these secrets (.env) rather than two. B2's own
# backend rather than its S3-compatible one — first-class support for lifecycle rules,
# and simpler credentials.
# B2's S3-compatible API, not rclone's native `b2` backend. The native one always checks
# the bucket exists and creates it if not, and has no way to turn that off — there is no
# `--b2-no-check-bucket`, only `--s3-no-check-bucket`. An application key scoped to a single
# bucket cannot create buckets, so every upload failed with a 401 whose message ("failed to
# create bucket") pointed at a permission we deliberately withheld. Choosing the native
# backend for "first-class lifecycle support and simpler credentials" was the wrong trade:
# it is incompatible with the narrow credential that is the point of the design.
export RCLONE_CONFIG_B2_TYPE=s3
export RCLONE_CONFIG_B2_PROVIDER=Other
export RCLONE_CONFIG_B2_ENDPOINT="$BACKUP_B2_ENDPOINT"
export RCLONE_CONFIG_B2_ACCESS_KEY_ID="$BACKUP_B2_KEY_ID"
export RCLONE_CONFIG_B2_SECRET_ACCESS_KEY="$BACKUP_B2_APPLICATION_KEY"
# Never try to create or stat the bucket — the key cannot, and does not need to.
export RCLONE_S3_NO_CHECK_BUCKET=true

readonly STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
readonly REMOTE_NAME="kayak-${STAMP}.sql.gz.age"
readonly REMOTE_PATH="B2:${BACKUP_B2_BUCKET}/postgres/${REMOTE_NAME}"

WORK_DIR="$(mktemp -d)"
readonly WORK_DIR
readonly LOCAL_FILE="${WORK_DIR}/${REMOTE_NAME}"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

# --- dump, compress, encrypt -------------------------------------------------------
# One pipeline, so the plaintext dump never touches disk — not even briefly, and not in
# a temp file that a crash would leave behind unencrypted.
log "dumping ${POSTGRES_DB} and encrypting to ${BACKUP_AGE_RECIPIENT}"
docker compose -f docker-compose.prod.yml exec -T postgres \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl |
	gzip -9 |
	age -r "$BACKUP_AGE_RECIPIENT" \
		>"$LOCAL_FILE"

# `set -o pipefail` catches a failing pg_dump, but an empty or absurdly small artifact
# can also mean a dump that "succeeded" against the wrong database. 1 KiB is far below
# any real schema and far above an empty age header.
LOCAL_SIZE=$(stat -c%s "$LOCAL_FILE")
readonly LOCAL_SIZE
if [ "$LOCAL_SIZE" -lt 1024 ]; then
	echo "ERROR: encrypted dump is only ${LOCAL_SIZE} bytes — refusing to upload it" >&2
	exit 1
fi
log "encrypted dump is ${LOCAL_SIZE} bytes"

# --- upload ------------------------------------------------------------------------
log "uploading to ${REMOTE_PATH}"
rclone copyto "$LOCAL_FILE" "$REMOTE_PATH"

# --- verify the remote object, rather than trusting the exit code ------------------
REMOTE_SIZE=$(rclone size "$REMOTE_PATH" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
readonly REMOTE_SIZE
if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
	echo "ERROR: uploaded ${LOCAL_SIZE} bytes but remote reports '${REMOTE_SIZE}'" >&2
	exit 1
fi

log "OK — ${REMOTE_NAME} (${LOCAL_SIZE} bytes) verified on B2"

# --- heartbeat ---------------------------------------------------------------------
# Optional, and only reached on success — the point is that silence means failure.
#
# This job's real failure mode is not "errors out loudly", it is "never runs at all":
# under systemd its output goes to the journal, which nobody reads, and the box
# suspends, so a missed window produces no output anywhere. A push monitor inverts
# that — uptime-kuma (the home-box instance, see DEPLOY.md) alerts when the ping
# does NOT arrive within the expected interval, so a timer that stopped firing, a box
# that stayed asleep, and a PATH that lost `age` all surface the same way.
#
# Unset = no ping and no complaint, same rule as the rest of this file's optional config.
# `|| true` because a monitoring outage must never fail a backup that actually worked.
if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
	if curl -fsS -m 10 "${BACKUP_HEARTBEAT_URL}" >/dev/null 2>&1; then
		log "heartbeat sent"
	else
		log "WARNING: heartbeat ping failed (the backup itself is fine)"
	fi
fi

if [ "$BACKUP_RETAIN_LOCAL" != "0" ]; then
	mkdir -p "$BACKUP_RETAIN_LOCAL"
	cp "$LOCAL_FILE" "$BACKUP_RETAIN_LOCAL/"
	log "local copy kept at ${BACKUP_RETAIN_LOCAL}/${REMOTE_NAME}"
fi
