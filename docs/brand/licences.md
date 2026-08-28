# Third-party licences — brand assets

Notices for third-party artwork shipped in the app. Keep this file in step with what is
actually in the tree: removing the asset means removing its notice, and adding one means
adding its notice in the same change.

## "CC0 Compass Rose" — the brand mark

The mark in every header lockup and in the browser tab: `frontend/components/common/brand-mark.tsx`,
`frontend/app/icon.svg`, and the rasterised `frontend/app/favicon.ico`. Also
`docs/brand/mail-mark-96.png`, the transactional-email raster — generated from `icon.svg` by
`scripts/build-mail-mark.sh` and uploaded to the public bucket under `brand/`. It bakes in the
mark's *dark* colourway, because the email header band is navy regardless of the reader's theme.
CC0 means this raster carries no notice of its own; it is listed here only so the tree and this
file stay in step.

Two modifications to the original: the enclosing ring and the fleur-de-lys crown are dropped, and
every fill is rebound to our own `--mark-*` tokens. Only the 24 point paths are used, under the
single flattened transform they all shared.

Source: https://commons.wikimedia.org/wiki/File:CC0_Compass_Rose.svg
Author: Kertase

**CC0 1.0 Universal (public domain dedication) — no obligation of any kind**, including no
attribution. This entry is a record of provenance, not a licence requirement. That is precisely
why this rose and not one of the others is the brand mark: a logo appears on every page, so an
asset carrying an attribution term (as the Reinel rose below does) would drag that term across the
whole app.

Dedication: https://creativecommons.org/publicdomain/zero/1.0/

## Phosphor Icons — `compass-rose` (duotone)

The former brand mark, in `frontend/components/landing/compass-rose.tsx`. Superseded by the CC0
rose above — its enclosing ring reads as a crosshair at header size, and its `ocean900` line work
is the same colour as the dark-mode background. It still renders on the `/design` showcase, so it
still ships and this notice still applies.

The two duotone path layers are recoloured from our own design tokens (`ocean900`,
`sunset500`); the path data is Phosphor's, unmodified.

Source: https://github.com/phosphor-icons/core (`assets/duotone/compass-rose-duotone.svg`)

The MIT licence requires this notice be retained wherever the work is distributed, including
in the built application.

## "Compass Rose-Black" — full chart rose

Shipped as `frontend/public/brand/chart-rose.svg`, used as the watermark behind empty states.
Optimised with svgo (path precision only, no shape edits); 237 KiB → 68 KiB.

Source: https://commons.wikimedia.org/wiki/File:Compass_Rose-Black.svg

**Public domain.** No attribution obligation — this entry is a record of provenance, not a
licence requirement.

## "Reinel compass rose" — 404 / 500 artwork

Redrawn as `frontend/components/illustrations/reinel-rose.tsx`: a replica of the compass rose on
Pedro Reinel's nautical chart of 1504, the first known rose to mark north with a fleur-de-lys.
The path geometry is unmodified; every fill and stroke is rebound to our own `--rose-*` tokens so
the mark reads as engraved ink in light mode and as a chart negative in dark.

Source: https://commons.wikimedia.org/wiki/File:Reinel_compass_rose.svg
Author: Joaquim Alves Gaspar

**CC BY 2.5 — attribution required.** Unlike the two entries above, this one is a live licence
obligation, and a notice in this file does not discharge it: the credit has to reach someone
looking at the running app. It is rendered under the rose on both error pages by
`frontend/components/illustrations/rose-credit.tsx`. That component exists precisely so a restyle
cannot quietly drop the credit while keeping the artwork — if the rose moves, `RoseCredit` moves
with it.

Licence: https://creativecommons.org/licenses/by/2.5/

```
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
