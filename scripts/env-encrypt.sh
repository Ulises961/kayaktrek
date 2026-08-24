#!/usr/bin/env bash
#
# Encrypt the local .env into secrets/env.prod.sops, ready to commit.
#
# Exists because the obvious invocation does not work: sops matches its creation rule
# against the INPUT path, so `sops --encrypt .env > secrets/env.prod.sops` fails with
# "no matching creation rules found". The file has to be at the matching path *before*
# being encrypted, which is what this does.
#
# Run on your dev machine, never on the server — the server only ever decrypts.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Defaults to .env.prod, not .env — the output is secrets/env.prod.sops, and a repo that
# has both a dev .env and a production .env.prod would otherwise quietly encrypt the wrong
# one under a name saying it was the right one.
readonly SOURCE="${1:-.env.prod}"
readonly ENCRYPTED="secrets/env.prod.sops"

command -v sops >/dev/null 2>&1 || {
    echo "ERROR: sops is not installed. Releases: https://github.com/getsops/sops/releases" >&2
    exit 2
}
[ -f "$SOURCE" ] || {
    echo "ERROR: $SOURCE not found." >&2
    echo "  Usage: $0 [path-to-plaintext-env]   (default: .env.prod)" >&2
    exit 2
}

if grep -q "REPLACE_WITH_DEPLOY_AGE_PUBLIC_KEY" .sops.yaml; then
    echo "ERROR: .sops.yaml still has the placeholder recipient." >&2
    echo "  Generate the DEPLOY keypair (not the backup one — see .sops.yaml) and put its" >&2
    echo "  age1... public key there first." >&2
    exit 2
fi

mkdir -p secrets
cp "$SOURCE" "$ENCRYPTED"
sops --encrypt --in-place --input-type dotenv --output-type dotenv "$ENCRYPTED"

# An "encrypted" file that is still readable is the one failure that must never ship.
#
# The invariant is "no line carries a non-empty plaintext value" — deliberately not "every
# line is ENC[...]", because sops legitimately leaves several kinds alone:
#   KEY=                 empty values are not encrypted; there is nothing to protect
#   sops_version=3.13.3  its own metadata block, including the recipient's public key
#   #ENC[...]            comments are encrypted, but keep their leading #
LEAKED=$(grep -nE '^[A-Za-z_][A-Za-z0-9_]*=.+' "$ENCRYPTED" \
         | grep -vE '=ENC\[' \
         | grep -vE '^[0-9]+:sops_' || true)
if [ -n "$LEAKED" ]; then
    echo "ERROR: $ENCRYPTED has plaintext values — refusing to leave it:" >&2
    echo "$LEAKED" | cut -d= -f1 >&2      # key names only, never the values
    rm -f "$ENCRYPTED"
    exit 1
fi

echo "OK — $ENCRYPTED written ($(grep -cE '^[A-Z_]+=ENC\[' "$ENCRYPTED") encrypted values)."
echo "Commit it. Variable NAMES are visible by design, so review shows drift; values are not."
