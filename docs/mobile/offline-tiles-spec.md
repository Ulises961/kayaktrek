# Offline Map Tile Management — Mobile Client Design Spec

> **Status: design only, unreviewed.** Written 2026-08-26 as M9a work package 2 (the M9a plan
> WP2), answering `docs/adr/mobile-offline.md`'s "Unresolved before M9 starts" item 4 and the
> "Map SDK — MapLibre React Native" section's offline-tile paragraph. No app code exists yet.
> This document does not edit `docs/adr/mobile-offline.md` directly — WP3 is concurrently
> editing that file; folding this in (or linking it from the decision log) is WP6's
> reconciliation pass, not this document's job. Feeds M9g (the M9 plan).

## Scope

Bounding-box strategy, zoom-level range, storage estimate display, download progress UI, and
eviction/storage-limit policy for MapLibre React Native's offline region download, downloading
against the M8 tile proxy (`backend/Services/tile_service.py`, `backend/Resources/tile_resource.py`).

---

## 1. Grounding — what the backend actually serves today

Read directly from `backend/Services/tile_service.py` and `backend/Resources/tile_resource.py`
rather than assumed from the ADR, because two things there turned out to not match what's built:

- **Route**: `GET /api/v1/tiles/<layer>/<z>/<x>/<y>.png`. Two layers exist:
  `osm` → `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and
  `seamark` → `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png`. **There is no third
  `titiler`/Sentinel-2 satellite layer** — `mobile-offline.md`'s MapLibre section
  ("titiler (Sentinel-2 satellite)") describes something that was never built. This spec is
  written against the real two-layer setup; the ADR wording is a WP6 reconciliation item (§7
  below).
- **Validation**: `0 <= z <= 19`, `0 <= x,y < 2**z`; an invalid layer or out-of-range coordinate
  raises `ValueError` → `404`. A `502` means the upstream (OSM/OpenSeaMap) was unreachable *and*
  no cached copy existed to fall back to.
- **Caching**: server-side only, on **local disk** — `backend/Services/tile_cache.py`, a plain
  directory under `TILE_CACHE_DIR`, with 90-day freshness (`FRESHNESS = timedelta(days=90)`,
  raised from 7 on 2026-09-23 to take load off the OSM/OpenSeaMap servers) and size/free-space
  caps evicting least-recently-used first (last use in atime, fetch time in mtime). A stale cached tile is served rather than a `502` when
  upstream is down — the proxy prefers "outdated but present" over "absent." This is a *server*-side
  cache, unrelated to whatever the device stores; it does mean a bulk pre-departure download from
  many users' devices doubles as organic cache-warming for that corridor.

  > **Corrected 2026-08-30.** This read "in `StorageService` (MinIO/R2)", which was true when WP2
  > was written and stopped being true in v0.6.0. Tiles moved **out** of the object store, not into
  > R2 with everything else: the proxy reads tile bytes into Flask and re-serves them, so the
  > browser never talks to the object store and every cache *hit* was paying a WAN round trip to
  > Cloudflare and back. Tiles are also the one stored thing with no durability requirement at all
  > — a lost tile is one upstream refetch — so a directory beats a bucket. The cap is a
  > blast-radius control, not a cost control: on a one-box deployment the cache shares a filesystem
  > with Postgres, and a full disk stops Postgres writing WAL. **MinIO is gone from production
  > entirely** and remains only in `docker-compose.yml` for local dev.
- **No auth**: the route carries no `@JWTService.authenticate_restful` — it is public. This
  matters for the mobile client: MapLibre RN's native tile fetcher does not need an
  `Authorization` header wired through it, which historically has been the awkward part of
  authenticated tile sources. Nothing to build here beyond pointing `styleURL`/tile source
  templates at the plain URL.
- **Rate limit**: `3000 per minute` per client IP (`flask_limiter`, `get_remote_address`),
  raised from 600 on 2026-09-23 so one device can download a region at full speed. Still the
  one real constraint on bulk downloads — see §5; the "600/min" figures below predate it.
- **Response header**: `Cache-Control: public, max-age=604800` (a week; was a day). This is an HTTP-cache hint for
  intermediate caches, not related to MapLibre's own on-device offline-pack storage — a pack's
  tiles persist until explicitly deleted regardless of this header, so no conflict.

---

## 2. Grounding — the actual MapLibre RN offline API

`@maplibre/maplibre-react-native`'s `offlineManager` singleton (confirmed via the official docs
page and cross-referenced against `rnmapbox/maps`, the sibling fork with the same lineage and a
near-identical API surface, since the official page's own content proved hard to fetch directly
from this session — see Sources):

- **`createPack(options, progressListener, errorListener)`** → `Promise<OfflinePack>`, resolving
  once the pack is *registered*, not once it's downloaded. `options`: `name` (pack id — used
  as the delete/lookup key), `styleURL`, `minZoom`, `maxZoom`, `bounds` (`[[neLng, neLat], [swLng, swLat]]`),
  optional `metadata` (arbitrary JSON — the natural place to stash `{tripId, tripTitle, layer, downloadedAt}`).
  **A resolved `createPack` promise means "download started," not "map ready" — the app must not
  treat it as completion.**
- **Progress**: `progressListener(offlinePack, status)` fires on download events. `status`
  carries `state`/`downloadState`, `percentage`, `completedResourceCount`, `requiredResourceCount`,
  `completedTileSize` (bytes). `errorListener(offlinePack, error)` fires on failure (a single
  tile 404/502, corrupt data, etc.) — errors are per-resource, not necessarily fatal to the whole
  pack.
- **`setProgressEventThrottle(ms)`** throttles how often `progressListener` fires — needed so a
  progress bar isn't re-rendered per-tile across a multi-thousand-tile download.
- **State/eviction methods**: `deletePack(name)`, `getPacks()`, `getPack(name)`,
  `invalidatePack(name)` (re-validates tiles against the server — costs a full re-fetch, not a
  cheap operation), `mergeOfflineRegions(path)`, `resetDatabase()` (nuke everything, last resort),
  `setTileCountLimit(limit)`, `setMaximumAmbientCacheSize(bytes)`, `clearAmbientCache()`,
  `invalidateAmbientCache()`.
- **A real gotcha, confirmed from the shared-lineage docs**: `downloadState`'s three values
  (`Inactive`/`Active`/`Complete`) use **different raw integers per platform** — iOS
  `{Inactive:1, Active:2, Complete:3}`, Android `{Inactive:0, Active:1, Complete:2}`. **Always
  compare against the library's exported constant, never a raw number** — a naive `status.state === 2`
  check silently means "Active" on iOS and "Complete" on Android.
- **A real gap, confirmed from the same sources**: **no `pause`/`resume` method exists.** The
  state machine is Inactive/Active/Complete only. This directly affects §5's progress-UI design —
  there is no clean "pause and continue later" the UI can offer; see the open question in §7.

Sources: [OfflineManager | MapLibre React Native](https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/) (method list: `createPack`, `invalidatePack`, `deletePack`, `invalidateAmbientCache`, `clearAmbientCache`, `setMaximumAmbientCacheSize`, `resetDatabase`, `getPacks`, `getPack`, `mergeOfflineRegions`, `setTileCountLimit`, `setProgressEventThrottle`, `addListener`, `removeListener`); [`MapLibreGL.offlineManager.createPack` finishes immediately · Discussion #508](https://github.com/maplibre/maplibre-react-native/discussions/508) (confirms `createPack` resolves on registration, not completion, and the `(offlinePack, status)` listener signature); [rnmapbox/maps `OfflineManager.md`](https://github.com/rnmapbox/maps/blob/main/docs/OfflineManager.md) (fetched directly — full `createPack` options shape, status field names, `deletePack`/`getPacks`/`getPack`/`invalidatePack`/`setTileCountLimit`/`setMaximumAmbientCacheSize` descriptions); platform-integer mismatch and Inactive/Active/Complete-only state set corroborated via search of `rnmapbox/maps` issue history (`OfflinePackDownloadState`).

**On the Mapbox-ToS clause `setTileCountLimit`'s docstring references**: that clause is specific
to Mapbox's own tile service and does not apply here — our tiles are OSM/OpenSeaMap via our own
proxy, not Mapbox's. The method itself is still worth using, as a **self-imposed device-storage
safety valve** (§6), just not for the reason its docstring names.

**Native module, not Expo Go**: consistent with M9a's already-decided styling boundary
(the M9a plan — "anything wrapping a native third-party view, MapLibre RN chief among them, is
budgeted as a native RN rewrite from day one"), `offlineManager` is a native module. It requires
an Expo dev-client / EAS build, not Expo Go. No new decision here, just noting the offline API
inherits the same constraint as the map view itself.

---

## 3. Bounding-box strategy — recommendation

**Recommend: route corridor + margin, auto-derived from the synced itinerary, not a user-drawn box.**

Reasoning:

- **The data already exists on-device by the time this matters.** M9c's WatermelonDB sync
  (the M9 plan) lands full itinerary days + points before M9g's tile download does — the
  corridor geometry (a buffered polyline through the trip's points, per day or for the whole
  trip) is a pure client-side computation over data the app already has, no extra network round
  trip and no new backend endpoint.
- **It matches the actual need.** The pre-departure checklist item this feeds
  (`mobile-offline.md`, "offline map downloaded") is "can I see the water I'm actually
  paddling," not "let me pick an arbitrary rectangle." A user-drawn box asks the paddler to do
  manual work (and re-do it if the route changes) to reconstruct something the app can already
  compute exactly.
- **A user-drawn box is a real UI component the mobile map layer doesn't have yet.** Per M9a's
  styling decision, MapLibre RN is a from-scratch native build — a freehand/rectangle-draw tool
  on top of it is new work with no other justification in the product; the web builder itself
  has no equivalent "draw a region" affordance to port.
- **Cost of being wrong is low and recoverable.** If the auto-derived corridor turns out
  insufficient in practice (see the reroute caveat below), the escape hatch in §3.1 covers it
  without building a full drawing tool.

**Margin**: default **5 km** each side of the route polyline (10 km total corridor width) —
enough to show the nearest plausible landing beaches and a one-bay lookahead without ballooning
tile count (see §4's math; corridor width is a much smaller cost driver than corridor length
because tile counts scale with the whole bounding rectangle, not just the polyline). Exposed as
an adjustable **2–15 km slider** in the download screen, not hardcoded — a paddler doing a more
exposed open-water crossing may want less margin (nothing but water on either side); a paddler
threading an archipelago may want more (small islands and channels a straight-line corridor
would clip).

### 3.1 Escape hatch for reroutes and bail-outs

M9d allows leader-only route edits mid-`happening` trip, and the ADR calls out `happening` as
the phase where the crew's ground truth wins. A route changed at sea can walk outside the
pre-downloaded corridor, and there's genuinely no connectivity at that point to redownload.
Two things, not a full draw tool:

1. **One-tap "expand corridor"** on the download screen before departure (re-run the same
   margin computation at, say, 2× the slider value) for anyone who wants a safety buffer for a
   likely bail-out route, without hand-drawing one.
2. **Graceful missing-tile behavior at sea is a correctness requirement, not a nice-to-have.**
   MapLibre renders a blank/grey tile for a region with no cached data — the map must not error
   or crash outside the downloaded corridor; it degrades to "no offline detail here," which is
   an honest and recoverable state, not a bug to route around.

A true user-drawn region tool is deferred, revisit only if real field usage shows the
corridor+margin default is insufficient (matches the project's general "decide from evidence,
not speculation" posture elsewhere in the ADRs).

---

## 4. Zoom level range — verify/refine the ADR's "zoom 8–15, a few hundred MB" figure

The ADR's number is a reasonable *ballpark* order of magnitude but folds together two things
that should be split: it is materially higher than a single-layer download suggests, and it is
dominated by one zoom level. Worked from first principles (XYZ tile width at latitude
φ ≈ `40075.16 · cos(φ) / 2^z` km; a 200 nm route ≈ 370 km; example latitude 50°N, a representative
temperate coastal latitude; 10 km corridor width):

| Zoom | Tile width (km) | Tiles along route | Tiles across width | Tiles total |
|---|---|---|---|---|
| 8  | 100.7 | 5   | 1  | 5     |
| 9  | 50.3  | 9   | 1  | 9     |
| 10 | 25.2  | 16  | 1  | 16    |
| 11 | 12.6  | 31  | 2  | 62    |
| 12 | 6.3   | 60  | 3  | 180   |
| 13 | 3.1   | 119 | 5  | 595   |
| 14 | 1.6   | 237 | 8  | 1 896 |
| 15 | 0.8   | 473 | 14 | 6 622 |

**Zoom 15 alone is ~71% of the total tile count** (6,622 of ~9,385 tiles across 8–15). At a
blended average of ~15 KB/tile (raster PNG — open-ocean tiles are a few KB, dense coastal/detail
tiles run 20–40 KB), that's roughly:

- **Zoom 8–15, one layer**: ~9,385 tiles × 15 KB ≈ **137 MB**. Two layers (`osm` + `seamark`,
  both needed for the app's actual map — the seamark overlay is the whole reason OpenSeaMap is
  in the stack) roughly **doubles this to ~270 MB** — this is what actually produces the ADR's
  "a few hundred MB," and it's worth stating explicitly that the figure only holds *because* two
  layers are downloaded, not one.
- **Zoom 8–14 only, two layers**: ~2,763 tiles/layer × 15 KB × 2 ≈ **~80 MB** — roughly a third
  of the full range, for the loss of building-front/individual-jetty-level detail.

**Recommendation: default download is zoom 8–14, both layers (~80–150 MB depending on
latitude/margin), not 8–15.** Offer zoom 15 as an opt-in **"landing detail"** tier scoped
narrowly — not the whole corridor at z15, but a small fixed-radius box (e.g., 1 km) around each
`stop`-type point and each `Place` the itinerary references. That's a handful of tiles per stop
rather than 6,600+ for the whole corridor, and it targets the actual use case for z15 detail:
reading a landing beach or harbour entrance close-up, not open water between stops. This keeps
the "few hundred MB" figure available for someone who wants it, without making it the default
every paddler pays for.

Numbers above are a planning estimate from tile geometry and typical raster PNG sizes, not
measured against this project's actual tile bytes (no backend endpoint reports that — see §7).
Treat the MB figures as order-of-magnitude, and validate against real downloaded pack sizes once
M9g has a device to test on.

---

## 5. Storage estimate display

Show, before the user commits to a download:

- **Total estimated size**, computed client-side from the tile-count formula in §4 applied to
  the trip's actual corridor geometry and the selected zoom tier(s) — deterministic, no network
  call required, and available even offline once the route is already synced.
- **Breakdown by tier**, not just one number: "Overview (zoom 8–14): ~80 MB" and "Landing detail
  (zoom 15, near stops): ~15 MB" as separate line items with separate toggles, so a
  storage-constrained device can opt out of the detail tier alone.
- **Device free space**, via `expo-file-system`'s free-space API, shown next to the estimate —
  not as an abstract number but as "you have 2.1 GB free" beside "this will use ~95 MB."
- **A warning, not a hard block**, if the estimate would leave the device under a low-space
  threshold (e.g., <500 MB free after download) — the user may have other apps/photos they'd
  rather manage than be blocked outright.
- **Expected download time is not shown as a promise** — see §6's rate-limit note; a rough
  "this may take a while on a slow connection" is honest, a numeric ETA is not, since neither
  connection speed nor the 600/min rate limit are things the client can predict accurately.

No new backend endpoint is required for this — flagged as a possible future accuracy
improvement in §7, not a blocker.

---

## 6. Download progress UI

Driven directly by §2's `progressListener` shape:

- **Registered → Downloading → Complete**, mapped from the library's `Inactive`/`Active`/`Complete`
  constants (never raw ints — see the platform-integer gotcha in §2).
- **Progress bar** from `status.percentage`, with `completedResourceCount`/`requiredResourceCount`
  shown as supporting text ("1,204 / 2,763 tiles") — resource count is a more honest unit than
  percentage alone for a download that can stall on a single slow tile.
- **`setProgressEventThrottle`** set to a few hundred ms so the UI doesn't re-render on every
  tile of a multi-thousand-tile pack.
- **Per-tile errors surface, don't block.** A tile-level `errorListener` firing (a single 404/502
  from upstream, which `tile_service.py`'s own stale-cache fallback should make rare but not
  impossible) should not fail the whole pack. Recommend presenting completion as **"Downloaded
  (a few tiles unavailable)"** when `completedResourceCount < requiredResourceCount` at
  `Complete` state, rather than blocking on 100%.
- **Bulk downloads and the 600/min rate limit (§1) are a real interaction to design around.** A
  z8–14, two-layer, ~2,763-tile-per-layer download is ~5,500 tiles — at the tile proxy's cap,
  that's a hard floor of **~9 minutes** even at the server's max allowed rate, before accounting
  for actual network latency per tile. The progress UI should not imply "should be instant" —
  and if MapLibre's native downloader fires requests faster than 600/min from one device (likely,
  since it isn't rate-limit-aware), some fraction of a first-pass download may legitimately 429
  and need `invalidatePack`/retry. This is worth flagging to backend as a possible argument for a
  higher or separate rate-limit tier for the tile route specifically once M9g is being built
  against a real device — not resolved here, since no backend work happens in M9a.
- **No pause/resume exists (§2).** The UI cannot offer a "pause" button that means anything at
  the library level. Backgrounding the app is not guaranteed to continue the download (this
  needs on-device verification, not assumed — see §7). The honest design is: closing/backgrounding
  the app mid-download leaves the pack in `Active` with partial `completedResourceCount`; on
  next foreground, the app should show "Download incomplete — tap to continue" and simply
  re-invoke `createPack` with the same pack `name`/options. Whether that safely resumes from
  where it left off, restarts from zero, or errors on a duplicate name is exactly the kind of
  thing the docs don't settle and needs a real device test (§7).

---

## 7. Eviction / storage-limit policy

- **One pack per (trip, layer) pair**, named deterministically (e.g. `${tripId}:${layer}:overview`
  and `${tripId}:${layer}:detail` for the two zoom tiers in §4), with `metadata` carrying
  `{tripId, tripTitle, downloadedAt}` — `createPack`'s `metadata` field exists exactly for this.
- **A "Manage offline maps" screen**, driven by `getPacks()`, listing every pack with trip title,
  size (`completedTileSize`), download date, and the trip's current state (pulled from the
  already-synced trip metadata — `building`/`happening`/`past`) with one-tap `deletePack`.
- **Suggest, never auto-delete.** A pack becomes an eviction *candidate* once its trip transitions
  to `past` — mirroring the ADR's existing "weather stops refreshing once `past`" logic — surfaced
  as a dismissible suggestion in the management screen, not a silent deletion. A past trip's tiles
  may still be wanted while writing up the trip narrative/log against the map (M7d).
- **Reconcile against synced trip state.** A pack whose `tripId` no longer matches a trip in the
  local WatermelonDB table (trip deleted, unshared, or the device's sync window aged it out)
  shows as "no longer available" with a delete affordance rather than disappearing silently or
  erroring.
- **`setTileCountLimit`** as a hard backstop against runaway storage use (not for the Mapbox-ToS
  reason its docstring names — see §2 — but as a sane device-storage ceiling), set well above any
  single trip's expected tile count from §4 but well below "unbounded."
- **Ambient cache is a separate pool from named packs**, filled by ordinary online map panning
  (not explicit downloads) and evicted automatically by the SDK (LRU-like), unlike named packs
  which persist until deleted. Cap it modestly via `setMaximumAmbientCacheSize` (e.g., 50–100 MB)
  so casual online browsing doesn't quietly eat into storage a paddler thinks they've reserved
  for explicit offline packs — these are two different budgets and the UI should not conflate
  them.
- **`resetDatabase()`** as a destructive, confirmation-gated, last-resort "reset all offline maps"
  in settings — for a corrupted offline database, not a normal flow.
- **A device-level total budget** (e.g., default 1 GB, user-adjustable) enforced in the app layer
  (not the library) — declining a new download, or prompting to free space by deleting an old
  trip's pack first, when a new estimate would exceed it.

---

## Open questions / not resolved here

1. **No native pause/resume, and whether re-`createPack` with the same name actually resumes
   (vs. restarts, vs. errors on a duplicate) is unverified from documentation alone.** Needs an
   on-device spike in M9g before the progress-UI's "tap to continue" affordance (§6) can be
   built with confidence.
2. **`downloadState`'s platform-specific raw integer values** (§2) are a real trap for whoever
   implements this — must code against the library's exported constants throughout, flagged here
   so it isn't rediscovered the hard way.
3. **The tile proxy's 600/min-per-IP rate limit was sized for interactive map panning, not bulk
   offline-pack downloads** (§6). A single device's first download can plausibly hit it. Worth a
   backend conversation before M9g ships, not resolved in this design-only pass. **Resolved
   2026-09-23:** raised to 3000/min; re-measure against a real device when M9g is built.
4. **`mobile-offline.md`'s MapLibre section names a `titiler`/Sentinel-2 satellite tile source
   that does not exist in the actual backend** (§1) — only `osm` and `seamark` are proxied. This
   spec is written against the real two layers; reconciling the ADR's wording is a WP6 item, not
   this document's.
5. **No backend endpoint reports actual cached tile byte sizes**, so §5's storage estimate is a
   geometric approximation (formula in §4), not a measurement. Worth revisiting only if real
   field downloads show the approximation is meaningfully off — not a blocker to write down now.
6. **The corridor-vs-reroute gap (§3.1)** is an accepted, documented limitation, not a solved
   problem — a mid-expedition leader reroute can still walk outside pre-downloaded tiles with no
   connectivity to fix it. The mitigation is graceful degradation (blank tiles, no crash) plus an
   optional wider pre-departure margin, not a guarantee of full coverage.
