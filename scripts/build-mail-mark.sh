#!/usr/bin/env bash
#
# Rasterise the brand mark for use in transactional email.
#
# Why this exists rather than just linking frontend/app/icon.svg:
#
#   1. Gmail strips <svg>, so email needs a raster.
#   2. The mark drives its fills from a <style> block with a prefers-color-scheme
#      swap. An email header band is a fixed dark navy (#122540) regardless of the
#      reader's theme, so the *dark* colourway has to be baked in — the light one is
#      a near-black navy that would vanish into the band. That is the same trap the
#      previous mark fell into against the dark app shell (frontend/CLAUDE.md).
#   3. ImageMagick here has no librsvg delegate, and its internal renderer does not
#      reliably apply CSS classes. Resolving them to inline fill= attributes first
#      makes the rasterisation independent of which renderer is installed.
#
# Output is committed at docs/brand/mail-mark-96.png and uploaded to the public
# bucket under brand/. Re-run this if the mark or its tokens change, then re-upload.
#
# Usage: scripts/build-mail-mark.sh [output.png]

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repo_root/frontend/app/icon.svg"
out="${1:-$repo_root/docs/brand/mail-mark-96.png}"

[ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }
command -v convert >/dev/null || { echo "ImageMagick 'convert' not found" >&2; exit 1; }

# The dark colourway from icon.svg's own @media block — kept here as literals on
# purpose. If the mark's tokens change, this file must be updated deliberately: a
# silent divergence would show up only in somebody's inbox.
INK="#e2edf6"
LIT="#3d84c4"
HULL="#e8942b"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sed -e 's|<style>[^<]*</style>||' \
    -e "s|class=\"ink\"|fill=\"$INK\"|g" \
    -e "s|class=\"lit\"|fill=\"$LIT\"|g" \
    -e "s|class=\"hull\"|fill=\"$HULL\"|g" \
    "$src" > "$tmp/mark.svg"

# 96px for a 48px display box, so it holds up on a 2x screen. Transparent ground —
# the band colour comes from the surrounding table cell, not from the image.
convert -background none -density 384 "$tmp/mark.svg" -resize 96x96 "$out"

echo "wrote $out"
identify "$out"
