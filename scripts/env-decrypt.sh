#!/usr/bin/env bash
#
# Decrypt secrets/env.prod.sops into the .env that docker compose reads.
#
# Run this on the server after `git pull`, before `docker compose up`. It is the step that
# makes the deployed configuration a checked-out file rather than something copied by hand
# months ago — which is the failure this replaces: a stale scp'd .env that silently
# disagreed with the repo until a container crashed on a variable it had never heard of.
#
# The private key is expected at ~/.config/sops/age/keys.txt (sops' default location) or
# wherever SOPS_AGE_KEY_FILE points. It is the DEPLOY key, not the backup key — see
# .sops.yaml for why those must be different.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

readonly ENCRYPTED="secrets/env.prod.sops"
readonly TARGET=".env"

command -v sops >/dev/null 2>&1 || {
    echo "ERROR: sops is not installed. Releases: https://github.com/getsops/sops/releases" >&2
    exit 2
}

[ -f "$ENCRYPTED" ] || { echo "ERROR: $ENCRYPTED not found" >&2; exit 2; }

KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
readonly KEY_FILE
if [ ! -f "$KEY_FILE" ] && [ -z "${SOPS_AGE_KEY:-}" ]; then
    echo "ERROR: no age key at $KEY_FILE and SOPS_AGE_KEY is unset." >&2
    echo "  This is the DEPLOY key. Install it from your password manager:" >&2
    echo "    mkdir -p ~/.config/sops/age && \$EDITOR ~/.config/sops/age/keys.txt" >&2
    exit 2
fi

# Decrypt to a temp file first. Writing straight to .env would truncate a working config
# the moment anything failed — leaving the box with no configuration at all, which is a
# worse state than the stale one this is fixing.
TMP="$(mktemp)"
readonly TMP
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

sops --decrypt --input-type dotenv --output-type dotenv "$ENCRYPTED" > "$TMP"

# A successful decrypt that produced nothing usable is still a failure.
if [ "$(grep -cE '^[A-Z_]+=' "$TMP")" -lt 5 ]; then
    echo "ERROR: decrypted output has almost no variables — refusing to overwrite $TARGET" >&2
    exit 1
fi

if [ -f "$TARGET" ]; then
    # Show which KEYS changed, never values. This is the drift that used to be invisible.
    ADDED=$(comm -13 <(grep -oE '^[A-Z_]+' "$TARGET" | sort -u) <(grep -oE '^[A-Z_]+' "$TMP" | sort -u) | tr '\n' ' ')
    REMOVED=$(comm -23 <(grep -oE '^[A-Z_]+' "$TARGET" | sort -u) <(grep -oE '^[A-Z_]+' "$TMP" | sort -u) | tr '\n' ' ')
    [ -n "$ADDED" ] && echo "new variables:     $ADDED"
    [ -n "$REMOVED" ] && echo "removed variables: $REMOVED"
    cp "$TARGET" "${TARGET}.bak"
    echo "previous .env kept at ${TARGET}.bak"
fi

mv "$TMP" "$TARGET"
trap - EXIT
chmod 600 "$TARGET"

echo "OK — $TARGET written from $ENCRYPTED ($(grep -cE '^[A-Z_]+=' "$TARGET") variables)"
