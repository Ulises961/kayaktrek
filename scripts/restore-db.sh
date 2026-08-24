#!/usr/bin/env bash
#
# Restore an encrypted backup — by default into a scratch database, so that rehearsing a
# restore is easy and destroying the live one is not.
#
# "A backup you have never restored is not a backup" is the reason this script exists at
# all. Running it against the default scratch target is the rehearsal; it costs a few
# minutes and is the only thing that actually proves the nightly job works.
#
#   ./scripts/restore-db.sh                       # newest backup -> scratch database
#   ./scripts/restore-db.sh kayak-2026-08-24T...  # a specific one -> scratch database
#   ./scripts/restore-db.sh --into-live <file>    # real recovery; asks before proceeding
#
# The age PRIVATE key is required here and is deliberately not on this box in normal
# operation (see backup-db.sh). Provide it for the duration of the restore only:
#
#   BACKUP_AGE_IDENTITY_FILE=/path/to/key.txt ./scripts/restore-db.sh
#
# Take it from your password manager, use it, and delete it again.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

: "${POSTGRES_USER:=kayak}"
: "${POSTGRES_DB:=kayak_prod}"
: "${BACKUP_RESTORE_DB:=kayak_restore_check}"

INTO_LIVE=0
BACKUP_NAME=""
while [ $# -gt 0 ]; do
    case "$1" in
        --into-live) INTO_LIVE=1 ;;
        -*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) BACKUP_NAME="$1" ;;
    esac
    shift
done

for var in BACKUP_B2_KEY_ID BACKUP_B2_APPLICATION_KEY BACKUP_B2_BUCKET BACKUP_AGE_IDENTITY_FILE; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: $var is not set" >&2
        [ "$var" = "BACKUP_AGE_IDENTITY_FILE" ] && \
            echo "  The private key is not kept on this box. Fetch it from your password" >&2 && \
            echo "  manager, point BACKUP_AGE_IDENTITY_FILE at it, and remove it afterwards." >&2
        exit 2
    fi
done

for tool in age rclone docker; do
    command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: '$tool' is not installed" >&2; exit 2; }
done

export RCLONE_CONFIG_B2_TYPE=b2
export RCLONE_CONFIG_B2_ACCOUNT="$BACKUP_B2_KEY_ID"
export RCLONE_CONFIG_B2_KEY="$BACKUP_B2_APPLICATION_KEY"

readonly REMOTE_DIR="B2:${BACKUP_B2_BUCKET}/postgres"

if [ -z "$BACKUP_NAME" ]; then
    BACKUP_NAME=$(rclone lsf "$REMOTE_DIR" | sort | tail -1)
    [ -n "$BACKUP_NAME" ] || { echo "ERROR: no backups found in ${REMOTE_DIR}" >&2; exit 1; }
    echo "newest backup: ${BACKUP_NAME}"
fi

if [ "$INTO_LIVE" = "1" ]; then
    TARGET_DB="$POSTGRES_DB"
    echo
    echo "  *** This will DROP AND REPLACE the live database '${TARGET_DB}'. ***"
    echo "  Everything written since ${BACKUP_NAME} will be gone."
    echo
    read -r -p "  Type the database name to confirm: " confirm
    [ "$confirm" = "$TARGET_DB" ] || { echo "aborted"; exit 1; }
else
    TARGET_DB="$BACKUP_RESTORE_DB"
    echo "restoring into scratch database '${TARGET_DB}' (pass --into-live for a real recovery)"
fi

WORK_DIR="$(mktemp -d)"
readonly WORK_DIR
trap 'rm -rf "$WORK_DIR"' EXIT

echo "downloading ${BACKUP_NAME}"
rclone copyto "${REMOTE_DIR}/${BACKUP_NAME}" "${WORK_DIR}/${BACKUP_NAME}"

echo "decrypting"
age -d -i "$BACKUP_AGE_IDENTITY_FILE" "${WORK_DIR}/${BACKUP_NAME}" | gunzip > "${WORK_DIR}/dump.sql"

DUMP_LINES=$(wc -l < "${WORK_DIR}/dump.sql")
echo "decrypted dump: ${DUMP_LINES} lines"
[ "$DUMP_LINES" -gt 10 ] || { echo "ERROR: dump looks empty" >&2; exit 1; }

psql_root() { docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d postgres "$@"; }

echo "recreating ${TARGET_DB}"
psql_root -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
psql_root -c "CREATE DATABASE \"${TARGET_DB}\";"
psql_root -d "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null

echo "loading"
docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 < "${WORK_DIR}/dump.sql" >/dev/null

# A restore that loads without error but produces no rows is the failure this rehearsal
# is for. Count something that must exist in any real database.
USERS=$(docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc "SELECT count(*) FROM users;" | tr -d '[:space:]')

echo
echo "OK — restored ${BACKUP_NAME} into '${TARGET_DB}' with ${USERS} user rows."
[ "$INTO_LIVE" = "1" ] || echo "Drop it when done: DROP DATABASE \"${TARGET_DB}\";"
