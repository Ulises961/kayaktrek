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
#   ./scripts/restore-db.sh --list                # show real backup names (B2 object keys)
#   ./scripts/restore-db.sh kayak-2026-08-24T...  # a specific one -> scratch database
#   ./scripts/restore-db.sh --into-live <file>    # real recovery; asks before proceeding
#
# <file> above is a B2 OBJECT KEY (what --list prints, e.g.
# "kayak-2026-08-24T151700Z.sql.gz.age") — never the database name. Passing the database
# name here looks plausible, because the confirmation prompt below also asks you to type
# the database name, and the two can look like the same kind of input under pressure.
# They are not: one selects which backup to load, the other confirms which live database
# to destroy. Get this wrong and the script now fails fast with a clear message before
# asking you to confirm anything destructive, rather than after — see the validation
# below, added after an incident where exactly this happened.
#
# The age PRIVATE key is required here and is deliberately not on this box in normal
# operation (see backup-db.sh — the nightly job holds only the public recipient and never
# needs this). Provide it for the duration of the restore only, and prefer never writing
# it to disk at all:
#
#   BACKUP_AGE_IDENTITY_FILE=<(your-password-manager-cli get kayak-backup-age-key) \
#       ./scripts/restore-db.sh
#
# That is a bash process substitution: the key travels down a file descriptor
# (/dev/fd/NN) and never touches a filesystem, so there is nothing to clean up
# afterwards. Two properties of this script make it safe — the check below tests that
# the variable is non-empty rather than that it is a regular file, and `age -d -i` reads
# it exactly once. A `<(...)` fd is a pipe and can only be consumed once, so a script
# that read the identity twice would fail here in a confusing way. Verified working
# against age's -i flag.
#
# Writing it to a file and deleting it afterwards is the obvious alternative and is worse
# than it looks: `shred` cannot reliably destroy anything on a journaling filesystem or on
# flash, so on a typical ext4-on-SSD box the key survives the cleanup that was supposed to
# remove it. If you must use a file, put it on tmpfs (/dev/shm) where a plain `rm` is
# genuinely sufficient because there is no persistent medium involved.

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
LIST_ONLY=0
BACKUP_NAME=""
while [ $# -gt 0 ]; do
    case "$1" in
        --into-live) INTO_LIVE=1 ;;
        --list|-l) LIST_ONLY=1 ;;
        -*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) BACKUP_NAME="$1" ;;
    esac
    shift
done

# B2 credentials are needed even to list backups; the decryption key and docker are not.
for var in BACKUP_B2_ENDPOINT BACKUP_B2_KEY_ID BACKUP_B2_APPLICATION_KEY BACKUP_B2_BUCKET; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: $var is not set" >&2
        exit 2
    fi
done

if [ "$LIST_ONLY" != "1" ]; then
    if [ -z "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
        echo "ERROR: BACKUP_AGE_IDENTITY_FILE is not set" >&2
        echo "  The private key is not kept on this box. Pass it straight from your" >&2
        echo "  password manager without writing it to disk:" >&2
        echo "" >&2
        echo "    BACKUP_AGE_IDENTITY_FILE=<(pw-cli get kayak-backup-age-key) $0" >&2
        echo "" >&2
        echo "  (a process substitution — the key goes down an fd, so there is nothing" >&2
        echo "  to delete afterwards. See the header for why deleting a file is worse.)" >&2
        exit 2
    fi
fi

REQUIRED_TOOLS="rclone"
[ "$LIST_ONLY" = "1" ] || REQUIRED_TOOLS="$REQUIRED_TOOLS age docker"
for tool in $REQUIRED_TOOLS; do
    command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: '$tool' is not installed" >&2; exit 2; }
done

# A warning, never an error: a private key on persistent storage is a bad idea, not an
# impossible one, and someone mid-recovery must not be blocked by a lecture.
#
# `-f` is false for a process substitution (/dev/fd/NN is a pipe), so the recommended
# form skips this check entirely and says nothing. It fires only for a real file — the
# old habit this script used to instruct — and only when that file is not on tmpfs.
if [ -f "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
    IDENTITY_FSTYPE="$(findmnt -no FSTYPE --target "$BACKUP_AGE_IDENTITY_FILE" 2>/dev/null || echo unknown)"
    case "$IDENTITY_FSTYPE" in
        tmpfs|ramfs) ;;
        *)
            echo "WARNING: the age private key is a real file on ${IDENTITY_FSTYPE} storage." >&2
            echo "  Deleting it afterwards will not reliably erase it — shred is ineffective" >&2
            echo "  on journaling filesystems and on flash. Prefer:" >&2
            echo "    BACKUP_AGE_IDENTITY_FILE=<(pw-cli get kayak-backup-age-key) $0" >&2
            echo "  or at least put it on /dev/shm, where rm is enough." >&2
            ;;
    esac
fi

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

readonly REMOTE_DIR="B2:${BACKUP_B2_BUCKET}/postgres"

if [ "$LIST_ONLY" = "1" ]; then
    echo "backups in ${REMOTE_DIR}:"
    rclone lsf "$REMOTE_DIR" | sort
    exit 0
fi

if [ -z "$BACKUP_NAME" ]; then
    BACKUP_NAME=$(rclone lsf "$REMOTE_DIR" | sort | tail -1)
    [ -n "$BACKUP_NAME" ] || { echo "ERROR: no backups found in ${REMOTE_DIR}" >&2; exit 1; }
    echo "newest backup: ${BACKUP_NAME}"
else
    # Confirm the name is a real object before anything else — in particular, before the
    # destructive --into-live prompt below. This closes a real incident: a database name
    # was passed where a backup object key was expected ("--into-live kayak_prod" when the
    # database is also called kayak_prod), and nothing noticed until deep into the
    # confirmation flow, then failed with a confusing age/gzip error instead of a clear one.
    # rclone lsf on a real name is a cheap remote list-and-match; on a bad one it's the
    # difference between "here's what you actually meant" and a scary DROP prompt for a
    # request that could never have succeeded.
    if ! rclone lsf "$REMOTE_DIR" | grep -Fxq -- "$BACKUP_NAME"; then
        echo "ERROR: '${BACKUP_NAME}' is not a backup in ${REMOTE_DIR}." >&2
        echo "  If that looks like a database name rather than a backup file, that's" >&2
        echo "  probably the mistake — this argument selects which backup to load, never" >&2
        echo "  which database to write to (the database is always \$POSTGRES_DB)." >&2
        echo "  See what actually exists: $0 --list" >&2
        exit 1
    fi
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

# `set -e` catches rclone returning non-zero, but do not rely on that alone: observed in
# practice, `rclone copyto` against a source that was itself wrong (a name that is not a
# real object) can complete without a hard error and simply not create the destination —
# no error text, no non-zero exit, just a missing file discovered two steps later as a
# confusing age/gzip failure. Check the actual artifact rather than trust the exit code,
# the same principle backup-db.sh already applies to what it writes.
[ -s "${WORK_DIR}/${BACKUP_NAME}" ] || {
    echo "ERROR: download produced no file (or an empty one) for '${BACKUP_NAME}'." >&2
    echo "  The name was validated against ${REMOTE_DIR} above, so this points at rclone" >&2
    echo "  or connectivity, not the backup name. Re-run with -v to see what rclone did." >&2
    exit 1
}

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
