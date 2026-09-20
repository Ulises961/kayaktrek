#!/usr/bin/env bash
#
# Rasterise the brand mark into the mobile app's launcher icon set.
#
# Sibling of scripts/build-mail-mark.sh, and it exists for the same reason: the
# source of truth for the mark is frontend/app/icon.svg (the CC0 rose — see
# docs/brand/licences.md), and every consumer that cannot render an SVG needs its
# own raster cut from it rather than a hand-drawn copy that drifts.
#
# Three things differ from the mail raster:
#
#   1. The LIGHT colourway is baked in, not the dark one. The launcher icon sits on
#      its own chart-paper ground, not on email's navy band.
#   2. iOS forbids transparency in the app icon, so icon.png is flattened onto that
#      paper ground. The Android adaptive layers stay transparent — the system
#      composes foreground over background itself, and a baked ground there would
#      show as a square behind the masked shape.
#   3. Android's adaptive foreground is drawn at 66% of the canvas. The outer ~33%
#      is reserve the launcher may crop to whatever mask the device uses (circle,
#      squircle, rounded square); art drawn into it loses its edges.
#
# ImageMagick here has no librsvg delegate and its internal renderer ignores CSS
# classes, so the classes are resolved to inline fill= attributes first — same
# workaround, same reason, as the mail script.
#
# Re-run this if the mark or its tokens change, then rebuild the dev client: these
# are native assets, so a JS reload will not pick them up.
#
# Usage: scripts/build-mobile-icons.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repo_root/frontend/app/icon.svg"
out_dir="$repo_root/mobile/assets"

[ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }
[ -d "$out_dir" ] || { echo "missing output dir: $out_dir" >&2; exit 1; }
command -v convert >/dev/null || { echo "ImageMagick 'convert' not found" >&2; exit 1; }

# icon.svg's own light colourway, and chartPaper from frontend/lib/tokens.ts. Literals
# on purpose, exactly as build-mail-mark.sh keeps its own: if the tokens change, this
# file is updated deliberately, because a silent divergence here surfaces only as a
# wrong-coloured icon on somebody's home screen.
INK="#16283f"
LIT="#1f63a8"
HULL="#d4820f"
PAPER="#f7f4ec"

# High enough that every cut below is a downscale, never an upscale. The viewBox is
# ~136 units, so 1600 renders it at roughly 3000px before resizing.
DENSITY=1600

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sed -e 's|<style>[^<]*</style>||' \
    -e "s|class=\"ink\"|fill=\"$INK\"|g" \
    -e "s|class=\"lit\"|fill=\"$LIT\"|g" \
    -e "s|class=\"hull\"|fill=\"$HULL\"|g" \
    "$src" > "$tmp/mark.svg"

# A single-ink cut for Android's monochrome layer, which the system tints itself.
sed -e "s|fill=\"$LIT\"|fill=\"$INK\"|g" \
    -e "s|fill=\"$HULL\"|fill=\"$INK\"|g" \
    "$tmp/mark.svg" > "$tmp/mark-mono.svg"

render() { # <svg> <mark px> <canvas px> <ground> <out>
  convert -background none -density "$DENSITY" "$1" \
    -resize "${2}x${2}" \
    -background "$4" -gravity center -extent "${3}x${3}" \
    -strip "$5"
}

# iOS / store listing: full-bleed square, opaque, mark at ~72% with optical margin.
# `-alpha off` drops the channel rather than relying on every pixel happening to be
# opaque — App Store Connect rejects an icon that carries an alpha channel at all.
render "$tmp/mark.svg" 740 1024 "$PAPER" "$out_dir/icon.png"
convert "$out_dir/icon.png" -alpha off -strip "$out_dir/icon.png"

# Android adaptive, 432² per the platform's own asset guidance.
render "$tmp/mark.svg" 285 432 none "$out_dir/android-icon-foreground.png"
render "$tmp/mark-mono.svg" 285 432 none "$out_dir/android-icon-monochrome.png"
convert -size 432x432 "xc:$PAPER" -strip "$out_dir/android-icon-background.png"

# Splash: transparent, the screen's own background colour shows through.
render "$tmp/mark.svg" 400 512 none "$out_dir/splash-icon.png"

# Expo's `web.favicon`. 48² matches the largest cut in frontend/app/favicon.ico.
render "$tmp/mark.svg" 48 48 none "$out_dir/favicon.png"

for f in icon.png android-icon-foreground.png android-icon-background.png \
         android-icon-monochrome.png splash-icon.png favicon.png; do
  identify "$out_dir/$f"
done
