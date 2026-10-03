---
id: mobile-offline
title: "Mobile & Offline: Sync Protocol, Conflict Resolution, GPS Integration"
abstract: Backend, web, and mobile are the product together (2026-08-23) — mobile is at parity with web, not a stripped-down companion. M9 (built) is that parity, network-mutate-first, no offline requirement. The offline-native layer this document actually specifies — WatermelonDB sync, device mutation queue, conflict resolution, GPS integration — is its own milestone, M26 (split 2026-09-07), not yet built. Expo managed + EAS, MapLibre RN, BLE/NMEA GPS, satellite communicator feed polling.
implementation: not-built
implementation_note: mobile/ exists and ships real, verified code — M9a/M9b/M9b2/M9b3/M9i are built and on real devices. What remains not-built is specifically this document's own subject — no WatermelonDB dependency, no device mutation queue, no sync-down/sync-up implementation anywhere in mobile/package.json. Design only, awaiting M26.
status: accepted
date: 2026-06-10
deciders: []
tags: [mobile, offline, sync, gps]
---

# Mobile & Offline: Sync Protocol, Conflict Resolution, GPS Integration

> **Split from M9 into its own milestone, M26, on 2026-09-07** — see "Phasing" below for the full
> reasoning. Before that date this document was M9's design doc; M9 has since been built (M9a,
> M9b, M9b2, M9b3, M9i — auth, nav, every screen's read/network-mutate surface, full UI parity with
> web) without ever needing anything this document specifies. What it specifies — WatermelonDB,
> the device mutation queue, conflict resolution, GPS integration — was never M9's actual
> justification; it was conflated into M9's number for lack of a second one at the time. It has one
> now. Read every "M9" reference below dated before 2026-09-07 as "M26."
>
> `implementation: not-built` remains accurate for M26 specifically: there is no WatermelonDB or
> device-mutation-queue dependency in `mobile/package.json`, and no sync-down/sync-up code
> anywhere in `mobile/`. Everything below is design awaiting M26, not a description of anything
> running.
>
> Historical note, kept for the record rather than because it still matters operationally: this
> document also used to record, as a settled decision, that a **PWA-offline tier ships first**
> (Service-Worker-cached web client, frozen route data, pre-downloaded tile corridor). That tier
> was **declined outright on 2026-08-23** (see the decision log) — there was never a Service Worker
> step between M18 and M9/M26. Every PWA mention in the phasing section below survives as history,
> not as a plan.
>
> Treat every mechanism here as a proposal to be checked against the schema and the client as they
> actually are when M26 starts, not as a description of anything running.

This document covers the design of the React Native mobile client's offline-native layer (M26) — why offline-first is non-negotiable for a maritime app, how the local and server databases are kept in sync, how conflicts are resolved, what gets synced and what doesn't, and how external GPS devices fit into the position-tracking model.

This is the most architecturally complex milestone in the project. That full design document now
exists — `docs/mobile/sync-protocol-spec.md` (M9a WP1, 2026-08-30), written and reviewed against
the actual final server schema, not the earlier draft this ADR originally described — so the
"nothing coded before the schema is written" gate this line used to state is already met; M26
proceeds against that spec, not a stub.

---

## Phasing — "bring the plan along" vs "live expedition", and why that line is now the M9/M26 boundary

Mobile offline access addresses two distinct needs that must not be conflated — and as of 2026-09-07,
they are no longer conflated under one milestone number either. The line below was always the real
seam; M9's own internal structure just didn't reflect it until a full milestone's worth of "read the
plan" work (M9a/b/b2/b3/i) had already shipped and made the mismatch obvious: those milestones are
about UI/information-architecture parity with web over the network, not about anything offline-native,
and lumping them under the same number as WatermelonDB/sync/GPS work implied a permanence to mobile's
"stripped-down" status that was never true and is now explicitly rejected (see `CLAUDE.md`'s
"Key Architectural Decisions" — backend, web, and mobile are the product together, mobile at parity
with web, neither stripped-down nor a replacement).

**1. Read the plan at sea, and interact with everything else the app has, over the network — M9**
A paddler wants to view their finalized route, day structure, conditions, and float plan, and
increasingly (M9i) everything else a trip has — crew, logs, buddies, inventory — with the same
information architecture as web, not a subset of it. This is met **without WatermelonDB**, purely
network-mutate-first, the same pattern M9b validated and M9i/M9b2/M9b3 extended. **Already built**
as of 2026-09-07: auth, nav shell, trip list, itinerary map, day strip, weather/sea display, float
plan, the Trip Detail hub, non-map feature parity (logs/buddies/inventory) in progress. Two
interim, non-native paths solved a strict subset of this before the native app existed — kept here
as history, not current guidance: PWA offline (declined outright 2026-08-23, never built), and GPX
export / the PDF float plan (both real, both still useful, neither a substitute for the app itself).

**2. Create, track, and log while on the water — M26**
A paddler wants to check in at waypoints, adjust the route mid-expedition, track real-time
position, and auto-generate expedition logs, all of it surviving a total loss of connectivity for
hours or days. These require **mutations at sea** — data created on the device that must survive
lost connectivity and sync when reconnected. This is the use case that justifies WatermelonDB, a
device-side mutation queue, and the full sync protocol this document specifies. **Not yet built.**

**Trigger for building M26 — overridden 2026-09-13.** Originally: a real user tries to *create or
edit data on the water* and M9's network-mutate screens fall short. "I wanted to check in at a
waypoint while offshore" or "I rerouted a day mid-expedition" were the signals — the same trigger
M9 originally carried, moved to M26 along with the milestone number. **Decided directly by the
user, 2026-09-13** (see the decision log below): development proceeds proactively rather than
waiting for that signal to fire. M9 itself never needed a trigger of this kind either way — its
own justification (parity with the web app people already use) was satisfied the moment M9a
shipped.

---

## Why offline-first (M26)

Sea kayaking expeditions happen in remote coastal environments where mobile connectivity is intermittent or absent for hours or days at a time. A mobile client that requires a network connection for *everything* is not useful at sea — but as of M9, that gap is narrower than it used to be: reading the plan, checking conditions, and reviewing the float plan already work over a connection made before departure, at parity with what web offers. Real offline durability — mutations made with zero connectivity, durably queued and replayed on reconnection — remains M26's job alone.

The mobile client must support the core *live-expedition* use cases — checking in, updating position, reviewing day conditions without a fresh fetch, adjusting a route mid-trip — without connectivity. Mutations made offline must be durably queued and replayed when connectivity is restored.

This is not a "nice to have" for the live-expedition case: it is the primary use case M26 exists for. "Offline-first" for the plan-reading use case is M9's job, already largely met by what's built; the full native sync architecture is justified only by the live-expedition use case (above), which is why it is its own milestone now rather than a phase of M9.

---

## Architecture overview

The mobile client is **offline-first**: it maintains a local WatermelonDB database (SQLite-backed, React Native) as its source of truth. The local DB is a denormalised subset of the main PostgreSQL schema containing only data relevant to the user's active and upcoming trips.

```
Device (WatermelonDB / SQLite)
  ├── Sync down: server → device (full entity snapshots on reconnection)
  ├── Sync up: device → server (device-side queue → batch endpoint)
  └── Weather/sea cache: device → server refresh check on reconnection
```

The backend is the single authoritative source for all shared data. The device holds a working copy.

---

## Sync down — server to device

On reconnection, the device pulls **full entity snapshots** for its subscribed trips. Field-level diffs are not used — entity snapshots are small enough at this domain scale that the simplicity of replace-the-whole-entity is worth more than the bandwidth saving of diffs.

**What triggers a sync**: app foreground and reconnection event. No periodic background polling — battery cost is not justified for a use case where connectivity is binary (you either have it or you don't at sea).

> **Qualified 2026-09-18 — the trigger set is unchanged, the *scope* and the *entry condition* are
> not.** The paragraph above answers "how often should we wake the radio at sea", and its answer
> stands. It was silently read as also answering two questions it never addressed: *which* trips a
> sync covers, and *when* a cached entity is due for a refresh. Sync scope became an artifact of
> where the trigger got wired (one trip, the one whose hub is mounted), and nothing anywhere
> expressed staleness at all. Both are corrected by the "Sync scope, priority tiers and staleness
> budgets" section below. Foreground + reconnect remain the only triggers for everything except
> tier 1; see that section for the one narrow case that earns true background refresh.

**What gets synced**:

| Data | Synced | Reason |
|------|--------|--------|
| Trip metadata (title, state, dates, `is_paused`) | Yes | Primary context |
| Full itinerary — days + points (coords, type, name, notes) | Yes | Primary navigation data; must be available offline |
| Crew list — names, emergency contacts (leader view), check-in status | Yes | Safety data |
| Own float plan fields | Yes | Member-editable at sea |
| Inventory checklist — required items, who is covering what | Yes | Useful at launch and at sea |
| Weather and sea state rows (see below) | Yes — read-only | Forecast needed offline |
| Full user profiles of other crew | No | Read-only history; accessible when connected |
| Past trips | No | Read-only history; accessible when connected |
| Trip logistics and reservations | No | Pre-departure only |
| GDPR export data | No | — |

**Sync down protocol**: the server needs to know which entities have changed since the device last synced. A `last_synced_at` timestamp per trip per device, combined with a server-side change timestamp on all entities, is the simplest approach. On reconnection, the device sends its `last_synced_at` per trip; the server returns everything changed since.

> **Superseded in detail by `docs/mobile/sync-protocol-spec.md` (M9a WP1, 2026-08-30).** That
> document is now the specification; this section survives as the intent behind it. Three
> corrections it makes to the paragraph above, folded in here so this file does not keep asserting
> things the spec has disproved:
>
> - The column is **`updated`, not `updated_at`** — that is the real name on `BaseModel`. It also
>   does **not propagate to parents**: moving a `Point` leaves `Day.updated` and
>   `Itinerary.updated` untouched, so a naive parent-level delta misses child edits entirely.
> - **The delta cannot detect deletions at all** in this schema. A row that is gone is not a row
>   with a newer timestamp. Tombstones (a deletion log, capturing DB-cascaded deletes) are required
>   and are the spec's §5 — the fragile part of the whole design.
> - Delta granularity is **per aggregate, not uniform** (spec §4), and the route does not travel
>   on this channel at all (spec §8.2).

---

## Sync scope, priority tiers and staleness budgets

Added 2026-09-18. The sync-down section above specifies *what* a sync carries and *when* it fires.
It never specified **which trips** a sync covers, or **when cached data is due for a refresh** —
and the consequence of leaving both implicit was a cache that is lazy per *screen*, not per trip.

**The failure this fixes.** A sync only ever ran for the trip whose Detail hub happened to be
mounted, because `startSyncTrigger(tripId)` lives in that screen's effect; the route travels on its
own channel (§8.2) and so is populated only by opening the Itinerary tab specifically. The result:
a trip whose Itinerary tab was never opened while connected has **no route at all** offline — the
single most important thing to have at sea, gated behind having tapped one particular tab while
signal lasted. Nothing was decided badly here; the question was never asked, and the trigger's
placement answered it by default.

### Periodic polling — still declined as a mechanism, replaced by staleness budgets

The "no periodic background polling" line was written about keeping data fresh *during* an
expedition, where it is plainly right: there is no signal to poll with. The window that actually
matters is the days *before* departure, on wifi at home, when the cache must be made warm and
recent against the moment signal disappears. That case is not covered by the original reasoning.

It is still not answered by a background timer. True periodic execution on either platform is
unreliable by construction — iOS `BGAppRefreshTask` fires at the OS's discretion and degrades with
infrequent app use, Android WorkManager has a 15-minute floor plus Doze — and it is bought with a
new config plugin, a background-execution surface on the Play review, and per-app battery
attribution visible in system settings, which is a poor trade for an app asking strangers to trust
it with position data.

**Instead: "periodic" means a staleness budget evaluated on the triggers that already exist.** On
foreground or reconnect, sweep anything past its budget. People open this app; foreground is a
serviceable poll proxy at zero cost and with no new permissions. Only **tier 1** earns true
background refresh, where the battery is genuinely repaid.

**Budgets, not queue position, decide entry into a sweep.** A strict priority queue has
head-of-line blocking: a slow or failing tier 1 on a marginal link means tiers 3 and 4 never run at
all. Priority orders work *within* a sweep — do the important thing first while signal lasts —
while budgets decide what enters it. The two do different jobs and both are needed.

### The tiers

Tiering is **trip-state-major, entity-minor**. A flat ranking of entity types produces absurdities
(a past trip's inventory syncing ahead of next weekend's route). Within state, **time to departure
outranks state**: a `building` trip leaving tomorrow needs more than a `building` trip in November.

| Tier | Scope | Budget | Background refresh |
|---|---|---|---|
| 1 | `happening` trips; `building` trips departing within ~48h | shortest | Yes — the only tier that earns it |
| 2 | Remaining `building` trips | medium | No — foreground/reconnect only |
| 3 | The user's own kit and gear library (cross-trip, not trip-scoped) | medium | No |
| 4 | Profile and settings | long; tiny payload, so tier placement barely matters | No |
| — | `past`/`archived` trips, explore/public routes | **not synced at all** — see below | No |

Within a trip, entity order follows *what breaks if it is missing* × *how fast it changes*:

1. **Route (days + points)** — catastrophic if absent, changes rarely, and its deltas are empty
   almost always. First, and nearly free to maintain.
2. **Weather/sea** — highest value, expires fastest. For a trip departing tomorrow this outranks a
   `happening` trip's own sync, because a `happening` trip's forecast may already be unrefreshable.
3. **Crew / float plan** — matters in an emergency, changes rarely, cheap to keep warm.
4. **Inventory / kit** — matters at packing time, which is pre-departure and on wifi.

**The device computes its own priority.** `state`, `date_from` and `date_to` are already columns on
the local `trips` table, so the sweep is ordered from the trip-list cache with no server round-trip
and no new endpoint. The trip list is the sweep index.

### Past trips, archived trips and explore routes are not synced — a cut, not a low tier

Lowest-priority still means *eventually runs, and grows on the device forever*. Explore is a
discovery surface acted on while connected; past and archived trips are read-later history. Both
would cost storage and sweep time permanently to serve a case nobody has had. This is consistent
with the sync table above, which already excludes past trips, and the reason is now recorded rather
than implied.

### Staleness must be expressed, not implied

The weather section below already requires an always-visible "forecast as of [timestamp]" label.
**That requirement generalises to every cached entity, and it is a precondition for widening sync
scope, not a follow-up to it.** Today a screen can only say *you are offline* — a boolean derived
from a failed fetch — never *this is from Tuesday*. The per-trip `last_pulled_at` needed to say so
already exists in the device's sync-cursor table and nothing surfaces it.

For crew and inventory, undated stale data is untidy. For **weather and sea state, a three-day-old
forecast rendered identically to a live one is a safety problem** — precisely the class of thing
the product's own terms disclaim. Widening sync scope without shipping the age indicator makes that
failure *more* likely, because far more screens will quietly have something plausible to show. Ship
the indicator first.

---

## Weather and sea data — read-only cache, refresh on reconnection

Weather and sea state data is a primary offline concern. A paddler at sea must be able to see the forecast for the days ahead when connectivity drops. It is included in the offline cache as part of sync-down.

**Key distinctions from other synced data**:
- Weather/sea data is **read-only on the device** — the mobile client never mutates it. There are no weather mutations to queue at all.
- It is produced by the backend's Celery weather-fetch task (OpenMeteo, 6h TTL), not by user action.
- The backend stops refreshing weather rows once a trip transitions to `past` — the server's copy is frozen at whatever the last fetch was.

**On reconnection, the freshness check is**:

```
for each day in synced trip:
    if server.weather.fetched_at > device.cached_weather.fetched_at:
        pull full Weather + Sea rows for that day
```

> **Corrected 2026-08-30 (M9a WP1, `sync-protocol-spec.md` §6.3/§6.4).** This block previously read
> `updated_at`, and **neither `Weather` nor `Sea` has such a column** — they deliberately do not
> derive `BaseModel`, which the spec argues was the right call and actively good for sync. The
> freshness key is a **new `Weather.fetched_at`**, with `Sea.recorded_at` bumped on refresh; both
> are backend work this commits to before M9c.
>
> This section is also incomplete as written: "refresh on reconnection" omits the
> **device-initiated** refresh (`POST /day/<id>/weather/refresh`, TTL-bypassing with a short
> cooldown), which spec §6.4 argues is the *highest-value* weather moment in the product — a
> paddler with a brief signal window wants to pull a fresh forecast on purpose, not wait for a
> passive reconnection check.

This is a simple timestamp comparison applied to every day's weather/sea rows — regardless of whether those hours have already passed. A device that was offline yesterday and reconnects today should receive updated rows for yesterday's hours if the server fetched a fresher version while the device was offline. The whole row is replaced (same replace-the-whole-entity principle as all other sync-down data).

**"Forecast as of [timestamp]"**: the cached `fetched_at` is displayed in the UI so the paddler knows exactly how fresh the forecast is without any guessing. This label is always shown — not only when data is stale. One column serves both jobs, which is why the spec puts it at parent level.

**After a trip transitions to `past`**: the Celery fetch task no longer refreshes weather rows for that trip. The device may pull a final sync on reconnection if the server's `fetched_at` is newer than the device's cache, after which the data is effectively immutable. No special case is needed — the timestamp comparison handles it correctly by definition.

---

## Sync up — a plain batch endpoint, not a broker

**Decided 2026-08-30 (M9a WP1), reversing this section's original premise.** Mutations made offline
are held in the device's own durable queue and POSTed as a **batch to a plain HTTP endpoint** when
connectivity is restored. The backend applies them in device-timestamp order via the standard
service layer and answers with a per-mutation result.

The original design published them to **RabbitMQ**. Three things decided against it:

- **Device-side durability is the durability that matters.** The mutations at risk are the ones
  made at sea, and no broker on the server protects those — the phone's own queue does. A broker's
  guarantee starts at the moment the device already has a connection, which is exactly the moment
  the risk has passed.
- **A broker makes every write async, so the phone can never say "saved."** It can only say
  "handed off." For a check-in at a waypoint that is a materially worse thing to show a paddler
  than a synchronous 200.
- **Failure containment is already solved another way.** The one thing queue separation would have
  bought is stopping a parked route conflict from wedging check-in and float-plan sync — and
  `sync-protocol-spec.md` §8.2 already carves the route onto its own channel to get that. Two
  channels with distinct semantics are far easier to reason about as two endpoints than as two
  queues.

**RabbitMQ stays, unchanged, as Celery's broker.** This decision is only about whether device
mutations travel over it; nothing about the weather-fetch, checkpoint-alert or expedition-log tasks
changes.

### Mutation envelope

Every queued mutation carries:

| Field | Purpose |
|-------|---------|
| `mutation_id` | UUID v7 generated on the device at mutation time — stable identity across retries |
| `entity_type` | e.g. `point`, `check_in`, `trip_member` |
| `entity_id` | UUID of the entity being mutated |
| `operation` | `create`, `update`, or `delete` |
| `payload` | Full entity snapshot for create/update; empty for delete |
| `device_timestamp` | ISO 8601 timestamp of when the mutation occurred on the device |
| `user_id` | Identity of the user who made the mutation |

### Idempotency

A device that loses its connection mid-batch retries the batch, so delivery is at-least-once whatever the transport. The backend checks `mutation_id` against a processed-mutations log before applying; if already seen, that entry is reported as applied and skipped silently, which is what makes a whole-batch retry safe. The processed-mutations table is append-only; it can be pruned after a safe retention window (90 days is a reasonable starting point — balance storage cost against the need to detect very late redeliveries). Note this idempotency requirement is **unchanged by dropping the broker** — it was never RabbitMQ's at-least-once delivery that created it, it was the retry.

### What can be mutated offline

Only data the device owns or the user controls:

| Mutation | Who | Notes |
|----------|-----|-------|
| Check-in at a waypoint | Any crew member | Own check-ins only |
| Update own float plan fields | Any crew member | `TripMember` personal safety data |
| Add/update personal inventory contribution | Any crew member | — |
| Route point add/move/delete | Leader only | Authorised by role |
| Day boundary changes | Leader only | `apply-boundaries` equivalent |
| `date_to` extension | Leader only | `happening` trips only |

Weather/sea data and trip metadata (state transitions, crew management) are not mutated offline. State transitions (`happening → past`) require connectivity — the safety and coordination implications are too significant to defer.

---

## Conflict resolution — governed by trip state

Conflict resolution is not a single global rule. The distinction reflects who has ground truth at each point in the lifecycle.

**Non-active trips** (`building`, `past`, `archived`): **server wins** for all shared trip data. Offline edits to a trip that is not currently underway are unusual; the server holds the authoritative planned state. Device wins only for the user's own personal data (their own float plan fields, their own notes on points).

**Active expedition** (`happening`): **device mutations are applied unconditionally**, in device-timestamp order. The crew on the water have information the server does not — a reroute made at sea because of weather, a check-in at a waypoint, an incident note. A server-wins rule during a live expedition would overwrite real events with a stale snapshot. That is the wrong call.

In practice, the role model eliminates most conflict scenarios within a `happening` trip:
- Route edits are leader-only → no crew vs leader conflict possible
- Check-ins are per-user → no conflict possible
- Position updates are per-user and ephemeral → no conflict possible
- Inventory contributions are per-item per-user → last-write-wins on device timestamp is sufficient

The one remaining edge case — the leader using two devices offline simultaneously and editing the same point on both — is resolved by last-write-wins on device timestamp. This is an acceptable trade-off for an extremely rare scenario.

**Multi-source position**: a crew member may have multiple active position sources simultaneously — phone GPS reporting every 30 seconds and a satellite communicator polled every 10 minutes, for example. The **latest event timestamp wins** (not ingestion timestamp). Satellite relay introduces latency — an inReach position may arrive at the server after a phone position even though the inReach reading is older. All position events are stored with their source tagged (`phone_gps`, `inreach_mapshare`, `nmea_bluetooth`, etc.) and their event timestamps. Current position displayed is the most recent event timestamp for that user across all sources; tracking history is the union of all sources.

---

## Live position — ephemeral, not queued

When connected during a `happening` trip, position updates go directly via **Redis pub/sub** — ephemeral, low-latency, outside the RabbitMQ queue. Position data is not queued when offline: it is only meaningful in real-time during an active expedition. If a message is lost, the next position update supersedes it.

---

## Map SDK — MapLibre React Native

`react-native-maps` (Google Maps / Apple Maps) has severely limited offline tile support — pre-downloading a coastal region for use without connectivity is not supported. A WebView-based Leaflet wrapper (e.g. `react-native-leaflet`) avoids this issue but introduces a WebView bridge for all map interactions — pan, zoom, markers, real-time position overlays — with measurable performance implications for a navigation-grade app used in field conditions.

**MapLibre React Native** (`@maplibre/maplibre-react-native`) is the mobile map SDK:

- Open-source fork of the Mapbox React Native SDK taken before Mapbox went proprietary in 2021
- Native GL rendering — same smoothness as Mapbox Native; no WebView bridge
- First-class offline region download API; works with any custom XYZ tile server
- Tile source is our own tile proxy — same origin as the web client. **Corrected 2026-08-30:** this
  previously read "MinIO proxy (OSM base tiles) and titiler (Sentinel-2 satellite)". Both halves
  were wrong. **`titiler` appears nowhere in the backend** and never did; the proxy (M8 D10,
  `tile_service.py`) serves `osm` and `seamark` only, and satellite imagery is not a tile source
  this product has. And the cache is no longer in an object store at all: v0.6.0 moved it to
  **local disk** (`Services/tile_cache.py`, `TILE_CACHE_DIR`), because the proxy re-serves tile
  bytes through Flask, so the browser never fetches from the store and every cache *hit* was
  paying a WAN round trip once production moved to R2. MinIO is out of production entirely. See
  `docs/mobile/offline-tiles-spec.md` (M9a WP2)
- MIT licensed; no usage fees regardless of load volume
- API close enough to Mapbox RN that if a migration back to Mapbox ever became necessary, the effort would be minimal

The web client stays on react-leaflet. The backend remains SDK-agnostic (raw WGS84 coordinates only). The tile proxy (`osm` + `seamark`, R2-cached) is shared between the web client and mobile MapLibre offline regions — note the "web PWA offline cache" half of that sharing no longer exists, the PWA tier having been declined outright on 2026-08-23.

**Offline tile management**: the user must explicitly download a region before departure. The pre-departure checklist should include an "offline map downloaded" step. Define a maximum tile storage limit per device. The route corridor for a 200 nm coastal trip at zoom levels 8–15 is roughly a few hundred MB — show a storage estimate before downloading.

---

## Authentication — Expo SecureStore

React Native cannot use httpOnly cookies (see `foundation.md` — ADR-001). The mobile client stores JWT access and refresh tokens in **`expo-secure-store`**:

- iOS: hardware-backed Keychain
- Android: hardware-backed Keystore (API 23+)

Android below API 23 (Android 6.0, released 2015) is not supported — hardware-backed storage is not guaranteed below this level, and effectively no devices in current use are below it. The JWT contract (15-minute access tokens, 30-day refresh tokens) is unchanged from the web client; only the storage mechanism differs.

---

## Screen structure — mobile mirrors web's information architecture, not a stripped-down shortcut

**Decision (2026-09-06)**: mobile gets a **Trip Detail** hub screen, the same information-architecture
role `frontend/app/(app)/trips/[id]/page.tsx`'s `TripDetailNav` tabs play on web (Itinerary/Crew/
Emergency info/Logistics/Items, Live while happening + member). It is reached from the trip list,
same as web; the itinerary map becomes one destination *from* it, not the screen the trip list
jumps straight into.

**Context**: M9b/M9b2 built the itinerary map as the trip list's only destination — tapping a trip
went straight to the map, and screens that are really trip-level (float plan: crew manifest, vessel,
shore contact) got bolted onto the map screen's day-strip row for lack of anywhere else to put them.
M9b3 caught this concretely: a "Float plan" chip sat next to the day selector with no logical
connection to route/day navigation, because the itinerary map was standing in for a trip-detail hub
it was never designed to be. Web never made this mistake — `float-plan.tsx` isn't even one of
`TripDetailNav`'s tabs there, it's reached from the trip-detail identity card's own share-and-print
action, kept deliberately *outside* the tab layout (`itinerary-frontend.md`'s M8 decision log).

**Decision**: mobile's screen graph should read as a stripped-down version of web's, not a
differently-shaped app that happens to share a backend. Where web has a concept (a trip has a detail
hub; float plan, crew, logistics live there; the map is the itinerary tab within it), mobile should
have the same concept, even when a first mobile pass ships fewer of that hub's tabs than web has.
"Read-only core" (M9b) was the right call for *what* shipped first; it should not have also decided
*where things live* — those are separable, and conflating them is what produced the chip-on-the-map
workaround. Concretely: build a Trip Detail screen (even a minimal one — Itinerary link + crew
manifest + float plan, matching what already exists rather than a v1 of every web tab) as the trip
list's actual destination, with the itinerary map as a sub-screen it links to.

**Consequences**: `float-plan.tsx` (M9b) is currently unreachable from anywhere in the mobile app as
of M9b3's WP2 — the chip that linked to it was removed for being on the wrong screen, and no
replacement link exists yet. This is the concrete, immediate cost of the decision, tracked here so
it isn't lost: **build the Trip Detail hub before shipping**, not "eventually." Sequencing against
M9i (non-map feature parity — logs/buddies/inventory, `plans/M9i.md`) and the drawer nav restructure
it owns is an open question, not decided here — the hub screen and the drawer are adjacent surfaces
built by different threads of work in the same session, and need to agree on where a trip list's tap
target lands before either commits to a shape.

---

## Point order and day assignment on mobile — explicit, through a boundary-setting interaction (2026-10-03)

**Decision.** On mobile, a point's position on the map, its order in the route, and the day it
belongs to are three separate edits, and only the first is a map gesture. Dragging a marker moves
the point and changes nothing else. Order and day assignment are set explicitly, through a
dedicated boundary-setting interaction modelled on web's builder (`itinerary-frontend.md` "Flat
edit surface: implicit boundary draft (M14)"), designed and built as its own milestone after M34.

**What led here.** M9d WP3 shipped per-point controls on the point-edit form: earlier/later
buttons for order within a day, and a day-picker for moving a point to another day. M34 then
tried to replace the earlier/later buttons with the drag itself — on drop, re-insert the point
after the nearest remaining stop in its day. On a device that rule garbled routes: the nearest
stop by straight-line distance is often not the point's neighbour along a route that doubles
back, so the line was redrawn out of order. The drag was cut back to reposition-only, and the
per-point controls were removed with it, day-picker included (M34 WP5, PR #319).

**Why not a smarter drop rule.** Projecting the drop onto the nearest route segment (web's M20
mid-route insertion rule) is order-aware where nearest-stop is not, and was considered. It was
set aside because it still infers intent from where a finger lets go, and a wrong inference
silently rewrites the route — a cost a leader may not notice until on the water. A tap-to-insert
can use that rule safely (M34 WP4) because the leader confirms a preview before anything
persists; a drag commits on release with no preview of the order change.

**Why not keep the per-point controls.** Day boundaries are a property of the sequence, not of
one point. Moving points one at a time from inside a form makes "where does Day 2 end?" a
multi-step chore, and it gave no view for reassigning several points at once — the reason
"insert a new day" was parked in M34. Web already settled this over several iterations (M4c's
always-visible boundaries, M14's implicit draft with atomic Save/Discard); mobile adopts the same
model rather than growing a second one.

**Accepted gap.** Until the boundary-setting milestone ships, a leader on mobile cannot reorder
stops within a day or move a stop to another day. Web does both. The offline-mutation table
above still lists "Day boundary changes" as a leader-only offline mutation — that remains the
intent; only the UI is missing. `movePointToDay`/`movePointWithinDay` stay in
`mobile/lib/itinerary/route-edits.ts`, tested and uncalled, as likely building blocks.

**Open for the milestone that builds it**, not decided here: whether within-day reorder lives on
the same per-day list as the boundaries; whether web's ID-anchored `DraftBoundary` ports or a
simpler commit shape suffices; and how an uncommitted draft interacts with the envelope queue and
route conflicts (M9d WP4) when the edit is made offline.

---

## External GPS device integration — two independent tiers

External GPS integration is structured in two independent tiers. They are not mutually exclusive — a paddler may use both simultaneously. The backend is agnostic to all sources: it receives `{ lat, lng, timestamp, trip_id, user_id, source }` regardless of origin.

### Tier 1 — Bluetooth BLE / NMEA (generic, manufacturer-agnostic)

**Scope**: any GPS device that broadcasts over Bluetooth — GPS watches (Garmin Fenix/Instinct, Suunto, Coros), chartplotters, handheld marine GPS units, VHF radios with DSC, generic BLE GPS receivers.

This tier covers the widest range of paddlers regardless of device brand through two sub-paths:

- **NMEA 0183 over Bluetooth serial**: the standard marine GPS protocol. Chartplotters and marine handhelds broadcast `$GPRMC` / `$GPGGA` sentences. `react-native-ble-plx` handles the Bluetooth transport; an NMEA parser extracts coordinates. Covers a broad range of existing marine hardware without per-device SDK work.
- **Bluetooth GATT Location and Navigation profile**: standard BLE profile for GPS watches. Covers Garmin, Suunto, and others that expose position via standard profiles.

The mobile client owns a `PositioningSource` abstraction with concrete implementations:

```
PositioningSource (interface)
  ├── PhoneGPSSource              (default, always available)
  ├── NMEABluetoothSource         (Tier 1 — BLE serial, NMEA parser)
  ├── BLEGATTSource               (Tier 1 — standard GATT profile)
  └── SatelliteFeedSource         (Tier 2 — see below)
```

Only one source is active at a time. Phone GPS is the universal fallback. A GPS watch has a better sky view and more sensitive antenna than a phone in a dry bag in a cockpit — the Tier 1 path is worth implementing for accuracy alone, independent of battery savings.

**iOS background constraints**: iOS restricts background Bluetooth and location for non-navigation apps. The app will need `Always` location permission and background modes declared in `Info.plist`. Evaluate whether Expo managed workflow supports this or whether a bare workflow is required before committing to the managed workflow for M9.

### Tier 2 — Satellite communicator feed polling (server-side)

**Scope**: satellite communicators that expose a shareable position feed URL — Garmin inReach (MapShare KML), SPOT, Zoleo, Bivy Stick, and future devices.

**How it works**: the user registers their device's sharing feed URL in their app profile. A Celery task on the backend polls that URL at the device's configured tracking interval (typically every 10 minutes at sea), parses the position data, and ingests it as a standard position update — indistinguishable from any other source at the backend level.

```
User registers feed URL in profile settings
  → Celery beat task polls URL at tracking interval
  → Parses position (KML, JSON, or device-specific format)
  → Ingests as { lat, lng, timestamp, user_id, source: "inreach_mapshare" }
  → Position appears on trip tracking view and shore contact link
```

**The phone is not involved.** Position data travels: satellite network → device provider's servers → our backend. This works even when the paddler's phone is off, in a dry bag, or out of Bluetooth range. For serious sea kayakers carrying inReach or SPOT as primary safety devices, this is the most important integration path in the entire GPS feature.

**Shore contact value**: a registered satellite feed means the shore contact view displays satellite-updated position every 10 minutes even with the phone off. This is a high-value safety feature at low implementation cost — the position ingestion pipeline is shared with all other sources.

**Garmin inReach specifics**: every consumer inReach can enable MapShare, generating a personal feed URL. This returns KML with position, timestamp, battery, and optional messages. No Garmin API account required — the user enables sharing and provides the URL. The IPC Outbound push API requires a Garmin Professional/enterprise account and is not applicable to a consumer kayaking app.

**SOS integration**: satellite communicator SOS functions bypass the app entirely and go directly to emergency response coordination (inReach → GEOS IERCC, SPOT → GEOS, Zoleo → IERCC). The app must not attempt to intercept or duplicate this flow. What the app can do is surface the SOS contact information and shore contact view prominently, and detect an SOS event via the feed if the device exposes it.

**Abstraction requirement**: the `SatelliteFeedSource` must be abstracted from day one — a device-specific parser interface (KML, JSON, proprietary) with concrete implementations per provider. Do not build a Garmin-only solution. The same research done for Garmin MapShare must be done for SPOT, Zoleo, and Bivy Stick before implementing their parsers.

**Feed URL authentication**: some providers (Zoleo, Bivy Stick) may require authentication on the feed URL. The user profile must be able to store credentials or tokens alongside the feed URL, stored encrypted.

---

## Unresolved before M9 starts

These are not optional design work — M9 coding must not begin until each is answered in a written spec:

1. **WatermelonDB schema**: the denormalised mobile schema is not derivable from the main PostgreSQL schema without deliberate design work. It must cover all synced entities, their relationships, and the fields required for offline use. Write it as a document.

2. **Sync down protocol detail**: the `last_synced_at` per-trip-per-device mechanism is referenced above but not fully specified. Define: what the server endpoint looks like, what the device sends, how partial syncs are handled, and how to detect deleted server-side entities.

3. ~~**Expo managed vs bare workflow**~~ — **answered 2026-08-23: Expo managed with config plugins, built through EAS.** Decided on two grounds rather than the usual merits. First, the target is a store listing and the dev box is Linux-only: an iOS store build needs macOS or a cloud builder, and EAS Build is that. Second, the objection this item was raised over no longer holds — `expo-location` covers background tracking and `react-native-ble-plx` ships a config plugin, so M9f Tier 1 does not force bare; the dev-client escape hatch remains if something exotic appears.

4. **Offline tile management UX**: bounding box strategy (route corridor + N km margin vs user-drawn box), zoom levels, storage estimate display, download progress, eviction policy.

5. **SatelliteFeedSource parser interface**: define the interface before implementing any device-specific parser. Must accommodate KML, JSON, and proprietary formats.

6. **Processed-mutations table retention window**: define before the table is created. 90 days is a starting point.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Offline-first mobile — WatermelonDB, sync protocol, conflict resolution | ADR-015 | 2026-05-09 | Implementation deferred to M9; sync contract must be reviewed against final schema before coding |
| External GPS device integration — BLE/NMEA + satellite feed polling | ADR-017 | 2026-05-09 | Proposed; design before M9 |
| Map SDK: MapLibre React Native | Supersedes ADR-015 §"Map SDK: Mapbox Native" | 2026-06-10 | Open-source Mapbox fork; MIT license; works with our own tile server (MinIO + titiler); no usage fees |
| Satellite feed polling (Garmin inReach) carved out of M26 into its own milestone, M29, targeting the already-shipped M8 web live map | Supersedes this doc's "Tier 2" scope (design unchanged) | 2026-09-10 | Backend-only, no WatermelonDB/mobile dependency; consumes M8's existing ingest/SSE pipeline directly. Garmin-only for v1 per `docs/mobile/satellite-feed-spec.md`'s confidence ranking; SPOT/Zoleo/Bivy Stick remain blocked on unresolved provider research. See `plans/M29-satellite-feed-web.md` |
| Weather/sea data included in offline cache | Amends ADR-015 §"What is synced" | 2026-06-10 | Read-only; full row replaced when server `updated_at` is newer; "forecast as of" label in UI |
| Mobile phasing — PWA-offline first, M9 sync when live-expedition use case justifies it | — | 2026-06-15 | "Bring the plan along" met by PWA + GPX + PDF float plan; M9 native app triggered by first real need to mutate/track at sea |
| **Superseded** — PWA-offline tier declined outright; the mobile app *is* the product | supersedes the 2026-06-15 row above | 2026-08-23 | The 2026-06-15 phasing assumed a PWA would cheaply meet "bring the plan along" before native work started. It was never built, and the call now is that it never should be: nobody plans an expedition from a phone browser, and fewer still install a PWA, so the tier would have been a Service Worker built to be discarded the moment M9c landed. M9a's "open decision: PWA gap" closes as **declined**, not deferred. Note the honest cost: until M9c ships, reading the plan at sea has no in-product answer — GPX export onto a handheld and the PDF float plan are the interim, and both already exist |
| Distribution — official store channels from the start, Play before App Store | — | 2026-08-23 | Sideloaded APKs were considered and rejected. The app asks a stranger to trust it with route plans, live position and E2E-encrypted medical notes; "download this APK and enable unknown sources" is precisely the friction and the trust signal it cannot afford against an established market. Play first at €25 one-time (versus Apple's yearly fee) with a closed test; App Store follows once the Android beta shows the product is worth the recurring cost. The gating cost of Play is **calendar, not money** — closed-testing tenure, background-location permission review, the Data safety declaration (precise location *and* health data, the latter E2E encrypted, which must be described accurately), and in-app account deletion plus a web-accessible deletion URL. All are free, all are slow, all can be started before the app is finished |
| **Mutation transport — a plain batch endpoint, not RabbitMQ** | supersedes ADR-015 §"Sync up — mutation queue via RabbitMQ" | 2026-08-30 | M9a WP1's one genuinely open decision, and the last thing blocking WP6 sign-off. Device mutations POST as a batch to a plain HTTP endpoint; the backend applies them in device-timestamp order through the standard service layer and answers per-mutation. Three reasons against the broker. (1) **Device-side durability is the durability that matters** — the at-risk mutations are the ones made at sea, and no server-side broker protects those; the phone's own queue does. A broker's guarantee begins the moment the device already has a connection, which is the moment the risk has passed. (2) **A broker makes every write async, so the phone can never say "saved"**, only "handed off" — materially worse to show a paddler checking in at a waypoint than a synchronous 200. (3) **Failure containment is already solved another way**: the one thing queue separation would buy is stopping a parked route conflict from wedging check-in and float-plan sync, and `sync-protocol-spec.md` §8.2 already carves the route onto its own channel for exactly that. Two channels with distinct semantics are easier to reason about as two endpoints than as two queues. Idempotency via the `mutation_id` processed-log is **unchanged** — it was the retry that required it, never RabbitMQ's at-least-once delivery. **RabbitMQ stays as Celery's broker**, untouched; this was only ever about device mutations |
| Sync protocol specified; five corrections folded back into this document | ADR-015 | 2026-08-30 | `docs/mobile/sync-protocol-spec.md` (M9a WP1) is now the specification for sync-down; this document keeps the intent and defers detail to it. Its §10 listed corrections this file was still asserting wrongly, all now applied: the change column is **`updated`, not `updated_at`**, and it does **not propagate to parents** (moving a `Point` leaves `Day`/`Itinerary` untouched); the `last_synced_at` delta **cannot detect deletions at all**, so tombstones are required (spec §5, the fragile part); `Weather`/`Sea` have **no `updated_at` column** — freshness moves to a new `Weather.fetched_at` with `Sea.recorded_at` bumped on refresh (§6.3); "refresh on reconnection" omitted the **device-initiated** refresh, which §6.4 argues is the highest-value weather moment in the product; and the tile source described "MinIO proxy + titiler (Sentinel-2)" when **`titiler` appears nowhere in the backend** and never did — the proxy serves `osm` and `seamark` only, and its cache is local disk since v0.6.0, never R2. The spec also commits to **eight pieces of backend work before M9c** (§9), now carried into `plans/M9.md` so M9b is sized against them rather than meeting them late |
| Medical notes parked — the on-device question is moot | — | 2026-09-02 | The feature was parked entirely (`docs/adr/safety-privacy.md` "Parked (2026-09-02)"), so there are no notes to sync and M9c has no medical-notes decision to make. Two consequences for this document: the Data-safety declaration in the 2026-08-23 distribution row no longer includes health data (precise location still applies), and `docs/mobile/sync-protocol-spec.md` §11 is annotated as moot rather than deleted. **Sidestepped, not answered** — if the feature is unparked, WP6's original tension returns unchanged: a leader needs crew notes exactly when there is no connectivity, and that is still at odds with what belongs on a phone that can be lost at sea. |
| M9b complete — read-only core built and verified on-device; two native/framework pitfalls worth carrying into M9c | `plans/M9b.md` | 2026-09-05 | All six WPs (auth, trip list, itinerary map, day strip, weather/sea, float plan) validated the stack against a real emulator and the live backend. Two gotchas found the hard way, not obvious from either library's docs: (1) **`react-native-safe-area-context`'s `SafeAreaView` silently drops `className`** — `react-native-css`'s auto-interop list only covers core RN components, and its own `react-native-safe-area-context` re-export wraps `SafeAreaProvider` (for CSS custom properties) but never touches `SafeAreaView`. A `Screen` component built on `SafeAreaView` + `className` renders with every Tailwind class silently no-op'd; the fix is a plain `View` for styling with `useSafeAreaInsets()` → inline `style` for the inset padding. (2) **A layout that declares `<Stack.Screen name="x">` for a route expo-router's file-based router already auto-registers duplicate-registers it** (React Navigation logs "`[Layout children]: ... is extraneous`") and navigation to that route silently does nothing — no error, no crash, the `Link`/`router.push` just no-ops. Keep the layout's `<Stack>` bare and set each screen's title via an in-file `<Stack.Screen options={...} />` instead; screen tests then need `expo-router`'s `Stack.Screen` stubbed inert, since it calls `useRoute()` and throws without a real navigator mounted. |
| **Mobile mirrors web's information architecture — a Trip Detail hub, not a stripped-down shortcut** | — | 2026-09-06, **hub built 2026-09-07** | See "Screen structure" above. Caught by M9b3 removing the "Float plan" chip from the itinerary map screen (it's trip-detail information, doesn't belong on the map, matches how web keeps it outside the Itinerary tab too) — the underlying problem is that mobile never built the trip-detail hub web has, so trip-level screens kept getting bolted onto whichever screen existed. **Resolved**: `trips/[id]/index.tsx` (the map) renamed to `trips/[id]/itinerary.tsx`, content unchanged; a new `trips/[id]/index.tsx` is the trip list's actual tap target now — destination name, `StateBadge`, and three links (Itinerary, Float plan, Items), matching this decision's own "minimal — link to what already exists" scope rather than a v1 of every web `TripDetailNav` tab (Crew folds into Float plan, which already carries the crew manifest; Logistics and the Live tab aren't built yet). Web's actual pattern is a persistent tab bar via a shared `layout.tsx`, not a landing screen you navigate away from — mobile's Stack-based navigation doesn't have an equivalent to a persistent cross-route tab bar, so a hub screen is the faithful translation of the same information-architecture role, not a literal port. `float-plan.tsx` and M9i's new `items.tsx` are both reachable again |
| **M26's trigger is overridden — development proceeds proactively, not gated on a real at-sea failure** | amends the "Trigger for starting M26" section, `plans/M26.md` | 2026-09-13 | Decided directly by the user: "I don't believe we need to wait for a trigger, proactive development is what drives the creation of this app in the first place." The trigger condition itself (a real user hitting M9's network-mutate ceiling at sea) is **not wrong as a signal**, it's just no longer the gate — M26 starts now on the existing spec (this document + `docs/mobile/sync-protocol-spec.md`), which was already complete, not stubbed. Sequencing is unchanged: M9c (offline DB + sync-down) before M9d (mutation queue) per `plans/M26.md`'s dependency chain; M9e (live position/tracking, reuses M8's backend surface directly, no WatermelonDB dependency) can run in parallel. |
| **Sync scope, priority tiers and staleness budgets — "no periodic polling" qualified, not reversed** | qualifies this doc's "Sync down" trigger paragraph; extends `plans/M9c.md` (new WP7) | 2026-09-18 | The trigger line ("app foreground and reconnection event, no periodic background polling") was being read as answering two questions it never addressed: which trips a sync covers, and when a cached entity is due to refresh. Scope had become an artifact of wiring — `startSyncTrigger(tripId)` lives in the Trip Detail hub's effect, so only the trip you opened syncs, and the route (on its own §8.2 channel, pulled by `itinerary.tsx`) only populates if you opened that specific tab. A trip whose Itinerary tab was never opened while connected has **no route offline at all**, which is the worst possible thing to have missing at sea. Four decisions. (1) **Periodic polling stays declined as a mechanism** — `BGAppRefreshTask` fires at the OS's discretion, WorkManager has a 15-minute floor plus Doze, and the cost is a config plugin, a Play background-execution review surface and visible per-app battery attribution; but the *reasoning* behind the original line only ever covered freshness at sea, and the window that matters is the pre-departure days on wifi. "Periodic" is reimplemented as a **staleness budget evaluated on the existing foreground/reconnect triggers**, with true background refresh for tier 1 only. (2) **Budgets gate entry to a sweep, priority orders work within it** — a strict priority queue head-of-line blocks, so a failing tier 1 on a marginal link would starve every lower tier. (3) **Tiering is trip-state-major, entity-minor**, with time-to-departure outranking state; a flat entity ranking would sync a past trip's inventory ahead of next weekend's route. The device orders its own sweep from `state`/`date_from`/`date_to`, already columns on the local `trips` table — no new endpoint. (4) **Past/archived trips and explore routes are cut, not demoted** — lowest priority still means "runs eventually and grows forever" for a case nobody has had. Separately: the always-visible "forecast as of" label generalises to **every** cached entity and is a **precondition** for widening scope, not a follow-up — `last_pulled_at` already exists per trip in the sync-cursor table and nothing surfaces it, and a three-day-old forecast rendered identically to a live one is a safety problem, not an untidiness. |
| **Mobile itinerary editing — split into a cheap form/list tier (build now) and map-canvas drag/create (stays deferred, on its own merits)** | amends root `CLAUDE.md`'s "Web remains the map-based itinerary-*building* surface... permanent" line and `ROADMAP.md`'s M9-direction entry | 2026-09-13 | The "permanent, web-only" framing conflated two different costs. Checked directly: MapLibre RN's `PointAnnotation`/`ViewAnnotation` (already installed, v11.3.8) has **native drag support** (`draggable`, `onDragStart`/`onDrag`/`onDragEnd`) — the screen-to-map projection risk that made a native builder look expensive isn't actually a blocker. What *is* expensive is the state machine web built around dragging across six milestones (M4/M4b/M4c/M4e/M14/M20) — `map-core.tsx` (1277 lines) + `map-builder.tsx` (554) + `boundary-divider.tsx` (263) alone: M14's draft-boundary materialization, M20's client-authoritative point-order re-chaining, live leg/distance recomputation mid-drag. Most of the math underneath (`dayRouteLegs`, `resolveLegDayNumber`, `getDayColor`, etc.) is pure TS, already reusable via `@shared/*` — it's the interaction/state layer that isn't portable and would need a real native rebuild. Decision: ship point add/edit/reorder, day moves, an emergency-stop insert at GPS position, and pause/abort as network-mutate-first mobile features now (M9i's own pattern, no WatermelonDB dependency, no map-canvas drag needed) — see `plans/M31.md`. Map-canvas drag-to-edit stays a separate, later, explicitly-not-yet-committed question, sized once the cheap tier's real usage shows whether anyone reaches for it on a phone. Komoot's own model (recommend larger screens for planning, but don't block editing on mobile) was the reference point raised for this call. |
| **Sync-up: the envelope queue carries every non-route mutation; WatermelonDB `pushChanges` is retired** | reconciles "Sync up — a plain batch endpoint" with `sync-protocol-spec.md` §2/§9 item 4 | 2026-09-25 | The two documents designed sync-up for different device architectures: this one an envelope queue posted in batches, the spec WatermelonDB `pushChanges` over synced tables. M9c settled which architecture the app has: WatermelonDB synced tables for the route, crew rows and contributions only, and plain read caches for kit, gear, logs, logistics and profile. `pushChanges` cannot carry a change to a cached entity without moving each into a synced table and rewriting its screen onto local models. The queue fits what exists: an offline screen queues an envelope and updates its own cache optimistically, and the batch replays on reconnect through the ordinary services, one transaction per envelope, idempotent by `mutation_id`. Creates carry a device-generated UUIDv7 so later queued changes can refer to them. The route keeps its own channel (§8.2 unchanged). The already-built WatermelonDB `push` endpoint for crew rows and contributions is removed once the queue covers them, to avoid two write paths for the same rows. The route itself is edited local-first on the device's synced route tables and pushed over its own channel, never as envelopes. `plans/M9d.md` |
| **Offline mutation scope widened: the route editor, crew drop-out, `date_to` extension, and pause/resume/abort/finish** | amends "What can be mutated offline" and absorbs `plans/M31.md` | 2026-09-25 | The itinerary is the product, and rerouting at sea is the case offline editing exists for, so M31's editor (point add/edit/delete/reorder, day moves, "add stop here" at the phone's position) is built inside M9d, offline-first, instead of network-only first and retrofitted, which would build its write path twice. This section had excluded crew management and state transitions as "too significant to defer". At sea, deferral happens anyway when there is no signal, and the alternative is the change not being recorded at all, so three are now allowed offline. **Crew drop-out**: a new "left the trip" state on the crew row, distinct from removal, so the float plan and shore contact know who is on the water. **`date_to` extension.** **Pause/resume/abort/finish.** Inviting and removing crew stay online-only. The accepted cost: a queued state change is eventual, so a trip aborted offline can still trigger a missed-checkpoint alert until the change reaches the server, and the device must show such changes as recorded but not yet sent. Applied during `happening` in device-timestamp order after re-checking the transition is still legal. `plans/M9d.md` |
| **The 2026-09-13 row's trigger fired; map-canvas drag-to-edit moves from "not yet committed" to planned (M34), and two of that row's own claims are corrected** | supersedes the 2026-09-13 row above in effect, not in text (kept for the record) | 2026-09-27 | On-device use of M9d WP3's form/list editor was judged "in no way comparable" to web's map-first builder — exactly the "sized once the cheap tier's real usage shows whether anyone reaches for it" trigger the earlier row set. Checking that row's own two claims against the actual code found both needed correction: (1) native drag support (`draggable`/`onDrag`/`onDragEnd`) sits on `ViewAnnotation`/`PointAnnotation`, not on `Marker` — the component `itinerary.tsx` actually renders, which has no drag props at all, so WP3 never had the primitive available, not "didn't use what was there." (2) "reusable via `@shared/*`" wasn't true when written — `route-edits.ts`'s `withBoundaries` and web's `boundaries.ts` had independently built the same day-boundary rule in two incompatible shapes (index-range `DaySlice` coupled to the drag-preview `MapState` reducer, vs. per-point `dayId`); nothing was extractable as-is. Folded in this session: `frontend/lib/itinerary/day-boundaries.ts` now exports `deriveDayBoundaries(days, orderedPoints)` (the per-point shape, matching the sync protocol and mobile's local tables), and `route-edits.ts` imports it via `@shared/itinerary/day-boundaries` instead of keeping a private copy. The six-milestone cost the original row attributed to "the state machine" is real but narrower than stated: it's the cost of **live-drag preview** specifically (`DraftBoundary`/`resolveDraft`, re-resolved every render frame) — deriving a boundary at all is the ~20 lines now shared. `plans/M34-mobile-drag-to-edit-itinerary.md` scopes point drag/reposition, drop-onto-a-day, and drag-reorder-within-a-day as drop-target gestures against the existing pure `route-edits.ts` functions, deliberately without porting `DraftBoundary` — day creation/removal via drag stays out of scope, unchanged from M9d WP3's own limit. Also raised, not yet decided: `@shared/*` is a `tsconfig.json` path alias onto a sibling directory in one working tree, which stops resolving the moment `mobile/` and `frontend/` are two repositories (`kayak-premium`/`kayak-core`, `docs/adr/foundation.md` "Open source"); the plan records publishing the pure subset as a versioned npm package as the recommended option against vendoring a copy at split time, and sets a standard — no `frontend`-only dependency in anything newly added to `@shared` — for M34's own new pure helpers to meet from the start. |
| **Point order and day assignment on mobile are explicit, set through a boundary-setting interaction modelled on web's; a marker drag repositions only** | amends the 2026-09-25 row's "point add/edit/delete/reorder, day moves" editor scope and M34's WP3/WP5; new section "Point order and day assignment on mobile" | 2026-10-03 | M34 WP3's reorder-on-drop (re-insert after the nearest stop in the day) garbled routes on a device, since straight-line nearest is not path-neighbour on a route that doubles back; the drag was cut to reposition-only (`40c0a304`). The per-point earlier/later buttons and day-picker were removed with it, deliberately: boundaries are a property of the sequence, and one-point-at-a-time from a form was never the interaction worth keeping. An order-aware drop rule (web's M20 nearest-segment projection) was considered and set aside — it still guesses intent on release with no preview, unlike WP4's confirmed tap-to-insert. Accepted gap until the boundary-setting milestone ships: mobile cannot reorder stops or move them between days; web can. The offline "Day boundary changes" mutation stays intended. Within-day reorder placement, `DraftBoundary` portability and offline-draft/conflict interaction are left to that milestone |
