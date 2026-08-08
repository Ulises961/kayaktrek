# Brand mark brief — compass rose

Hand this to a vector-design tool or a designer. The current in-repo mark
(`frontend/components/landing/compass-rose.tsx`) is a placeholder drawn in code; it is
meant to be replaced by proper vector art, not refined further by hand.

## What it is

The single brand mark for Kayaktrek (kayaktrek.app), a sea-kayak expedition planner. It sits
next to the wordmark in a slim "chart publication strip" header, on the landing page, the auth
pages, and the authenticated app shell. The whole product's visual language is a **nautical
paper chart**: warm paper ground, navy ink, hairline graticules, a title cartouche, a scale bar.
The mark should read as a piece of chart furniture, not as a generic app icon.

## Direction

A **magnetic compass needle** — slim, two-tone (one half solid, one half hollow/outlined),
pivoting on a small centre boss, with cardinal letters **N / W / E / S** set around it.
Reference for the silhouette: the stock image trialled at `frontend/public/compass.webp`
(not usable — watermarked stock art). Take the shape language from it, not the file.

Not wanted: rings-and-8-point-star roses (that was the previous placeholder), 3D/skeuomorphic
brass, gradients, drop shadows, or anything that needs more than flat fills to read.

## Hard requirements

| Requirement    | Spec                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| Format         | SVG, single file, no embedded raster, no external fonts (letters as outlined paths) |
| Canvas         | Square, `viewBox="0 0 48 48"`, artwork centred with ~2px optical margin           |
| Background     | Transparent — never a white plate                                                |
| Legibility     | Must survive **26 × 26 px** — that is the real header size. Test at 26px first, not at 200px. If the N/W/E/S letters can't hold at 26px, supply a lettered and an unlettered variant (see below) |
| Stroke weights | No hairlines below ~1px at the 48-unit scale; prefer filled shapes over strokes so scaling can't thin them out |
| Colour         | Flat fills only, from the palette below. Max 3 inks                              |
| Licence        | Original work or a licence that permits commercial use and modification. No watermarked stock |

## Palette (from `frontend/lib/tokens.ts`)

| Role                                   | Hex       | Token       |
| -------------------------------------- | --------- | ----------- |
| Primary ink (solid needle half, letters) | `#0d1b2e` | `ocean900`  |
| Secondary ink (hollow half outline, boss) | `#1a3554` | `ocean700`  |
| North accent (the north-pointing half)   | `#d97706` | `sunset500` |

Paper ground it sits on is `#f7f4ee`-ish (`--chart-paper`, `oklch(0.966 0.009 92)`) — do not
bake the paper into the file, but check contrast against it.

## Variants to deliver

1. **`compass.svg`** — full mark, cardinal letters, three inks. Used at 26–56px.
2. **`compass-mono.svg`** — same geometry, all `currentColor`/single ink, no accent. Needed for
   dark surfaces and for anywhere the mark must tint to context.
3. **`compass-mini.svg`** — optional, letters dropped, geometry thickened, for ≤20px and favicon.

Also useful: a favicon-ready 32/180/512 export set, since the app currently ships none.

## Motion hook (please keep the geometry compatible)

The needle animates once on page load — it swings in from −34°, overshoots to +7°, and settles
to 0° (`chart-needle-settle` in `frontend/app/globals.css`). For that to work, the **needle must
be a separate group from the letters and the dial**, and its transform origin must be the pivot
at the exact centre of the canvas. Please keep the needle in its own `<g id="needle">` and the
static furniture in `<g id="dial">`.

## Integration seam

Drop the files into `frontend/public/brand/` and swap the body of
`frontend/components/landing/compass-rose.tsx` — it takes `size` and `className` and is the
only consumer-facing entry point (`ChartHeaderBar`, landing hero, auth header all go through it).
Keep it `aria-hidden` — the adjacent wordmark carries the accessible name.
