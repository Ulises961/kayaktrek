---
id: mobile-offline
title: "Mobile & Offline: Sync Protocol, Conflict Resolution, GPS Integration"
abstract: The mobile app IS the product (2026-08-23) — PWA tier declined outright, M9 React Native with WatermelonDB sync proceeds without waiting for a validated mutation use case, distributed through official stores (Play first). Expo managed + EAS, MapLibre RN, BLE/NMEA GPS, satellite communicator feed polling.
implementation: not-built
implementation_note: No mobile/ workspace, no WatermelonDB or MapLibre dependency. The service worker is now declined rather than pending. Design only, awaiting M9 — whose gates (M8, M13) are both cleared as of 2026-08-23, making it next.
status: accepted
date: 2026-06-10
deciders: []
tags: [mobile, offline, sync, gps]
---

# Mobile & Offline: Sync Protocol, Conflict Resolution, GPS Integration

> **None of this is built.** `implementation: not-built` — there is no `mobile/` workspace, no
> WatermelonDB or MapLibre dependency in any `package.json`, and no service worker or web app
> manifest in `frontend/`. Everything below is design awaiting M9.
>
> This matters because the document also records, as a settled decision, that the **PWA-offline
> tier ships first** (Service-Worker-cached web client, frozen route data, pre-downloaded tile
> corridor) — and that read as done. `plans/M9.md` inherited it as a satisfied prerequisite;
> M18's planning is what caught that nobody had built it.
>
> **That tier was then declined outright on 2026-08-23** (see the decision log), so the sequencing
> in the paragraph above is dead: there is no Service Worker step between M18 and this. Every
> mention of the PWA in the phasing section below survives as history, not as a plan. M18 shipped;
> M9 is next.
>
> Treat every mechanism here as a proposal to be checked against the schema and the client as
> they actually are when M9 starts, not as a description of anything running.

This document covers the design of the React Native mobile client (M9) — why offline-first is non-negotiable for a maritime app, how the local and server databases are kept in sync, how conflicts are resolved, what gets synced and what doesn't, and how external GPS devices fit into the position-tracking model.

This is the most architecturally complex milestone in the project. Nothing here should be coded before the WatermelonDB schema is written as a full design document and reviewed against the final server schema.

---

## Phasing — "bring the plan along" vs "live expedition"

Mobile offline access addresses two distinct needs that must not be conflated:

**1. Read the plan at sea (prototype → beta scope)**
A paddler wants to view their finalized route, day structure, conditions, and float plan without connectivity. This is a **read-only** need. It is met before a native app exists, via:
- **PWA offline**: the web client, Service Worker–cached, with frozen route data and OpenSeaMap tiles for the route corridor pre-downloaded. Route data is kilobytes; tile corridor is tens to low hundreds of MB.
- **GPX export**: the decided `GET /api/itinerary/:id/export?format=gpx` endpoint loads the route onto any chartplotter, OsmAnd, or handheld GPS. Offline by definition.
- **PDF float plan**: already built; offline by definition.

These solve "bring the plan along" with zero native app work. Build them first.

**2. Create, track, and log while on the water (M9 scope)**
A paddler wants to check in at waypoints, adjust the route mid-expedition, track real-time position, and auto-generate expedition logs. These require **mutations at sea** — data created on the device that must survive lost connectivity and sync when reconnected. This is the use case that justifies WatermelonDB, a device-side mutation queue, and the full sync protocol.

**Trigger for building M9**: a real user (or Ulises on a real trip) tries to *create or edit data on the water* and the PWA falls short. Not before. "I wanted to check in at a waypoint while offshore" or "I rerouted a day mid-expedition" are the signals. The plan-reading need is already met by the time that signal arrives.

---

## Why offline-first

Sea kayaking expeditions happen in remote coastal environments where mobile connectivity is intermittent or absent for hours or days at a time. A mobile app that requires a network connection is not useful at sea.

The mobile client must support the core expedition use cases — viewing the planned route, checking in, updating position, reviewing day conditions — without connectivity. Mutations made offline must be durably queued and replayed when connectivity is restored.

This is not a "nice to have": it is the primary use case. But "offline-first" for the plan-reading use case is solved by the PWA; the full native sync architecture is justified only by the live-expedition use case (above).

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
| Weather/sea data included in offline cache | Amends ADR-015 §"What is synced" | 2026-06-10 | Read-only; full row replaced when server `updated_at` is newer; "forecast as of" label in UI |
| Mobile phasing — PWA-offline first, M9 sync when live-expedition use case justifies it | — | 2026-06-15 | "Bring the plan along" met by PWA + GPX + PDF float plan; M9 native app triggered by first real need to mutate/track at sea |
| **Superseded** — PWA-offline tier declined outright; the mobile app *is* the product | supersedes the 2026-06-15 row above | 2026-08-23 | The 2026-06-15 phasing assumed a PWA would cheaply meet "bring the plan along" before native work started. It was never built, and the call now is that it never should be: nobody plans an expedition from a phone browser, and fewer still install a PWA, so the tier would have been a Service Worker built to be discarded the moment M9c landed. M9a's "open decision: PWA gap" closes as **declined**, not deferred. Note the honest cost: until M9c ships, reading the plan at sea has no in-product answer — GPX export onto a handheld and the PDF float plan are the interim, and both already exist |
| Distribution — official store channels from the start, Play before App Store | — | 2026-08-23 | Sideloaded APKs were considered and rejected. The app asks a stranger to trust it with route plans, live position and E2E-encrypted medical notes; "download this APK and enable unknown sources" is precisely the friction and the trust signal it cannot afford against an established market. Play first at €25 one-time (versus Apple's yearly fee) with a closed test; App Store follows once the Android beta shows the product is worth the recurring cost. The gating cost of Play is **calendar, not money** — closed-testing tenure, background-location permission review, the Data safety declaration (precise location *and* health data, the latter E2E encrypted, which must be described accurately), and in-app account deletion plus a web-accessible deletion URL. All are free, all are slow, all can be started before the app is finished |
| **Mutation transport — a plain batch endpoint, not RabbitMQ** | supersedes ADR-015 §"Sync up — mutation queue via RabbitMQ" | 2026-08-30 | M9a WP1's one genuinely open decision, and the last thing blocking WP6 sign-off. Device mutations POST as a batch to a plain HTTP endpoint; the backend applies them in device-timestamp order through the standard service layer and answers per-mutation. Three reasons against the broker. (1) **Device-side durability is the durability that matters** — the at-risk mutations are the ones made at sea, and no server-side broker protects those; the phone's own queue does. A broker's guarantee begins the moment the device already has a connection, which is the moment the risk has passed. (2) **A broker makes every write async, so the phone can never say "saved"**, only "handed off" — materially worse to show a paddler checking in at a waypoint than a synchronous 200. (3) **Failure containment is already solved another way**: the one thing queue separation would buy is stopping a parked route conflict from wedging check-in and float-plan sync, and `sync-protocol-spec.md` §8.2 already carves the route onto its own channel for exactly that. Two channels with distinct semantics are easier to reason about as two endpoints than as two queues. Idempotency via the `mutation_id` processed-log is **unchanged** — it was the retry that required it, never RabbitMQ's at-least-once delivery. **RabbitMQ stays as Celery's broker**, untouched; this was only ever about device mutations |
| Sync protocol specified; five corrections folded back into this document | ADR-015 | 2026-08-30 | `docs/mobile/sync-protocol-spec.md` (M9a WP1) is now the specification for sync-down; this document keeps the intent and defers detail to it. Its §10 listed corrections this file was still asserting wrongly, all now applied: the change column is **`updated`, not `updated_at`**, and it does **not propagate to parents** (moving a `Point` leaves `Day`/`Itinerary` untouched); the `last_synced_at` delta **cannot detect deletions at all**, so tombstones are required (spec §5, the fragile part); `Weather`/`Sea` have **no `updated_at` column** — freshness moves to a new `Weather.fetched_at` with `Sea.recorded_at` bumped on refresh (§6.3); "refresh on reconnection" omitted the **device-initiated** refresh, which §6.4 argues is the highest-value weather moment in the product; and the tile source described "MinIO proxy + titiler (Sentinel-2)" when **`titiler` appears nowhere in the backend** and never did — the proxy serves `osm` and `seamark` only, and its cache is local disk since v0.6.0, never R2. The spec also commits to **eight pieces of backend work before M9c** (§9), now carried into `plans/M9.md` so M9b is sized against them rather than meeting them late |
| Medical notes parked — the on-device question is moot | — | 2026-09-02 | The feature was parked entirely (`docs/adr/safety-privacy.md` "Parked (2026-09-02)"), so there are no notes to sync and M9c has no medical-notes decision to make. Two consequences for this document: the Data-safety declaration in the 2026-08-23 distribution row no longer includes health data (precise location still applies), and `docs/mobile/sync-protocol-spec.md` §11 is annotated as moot rather than deleted. **Sidestepped, not answered** — if the feature is unparked, WP6's original tension returns unchanged: a leader needs crew notes exactly when there is no connectivity, and that is still at odds with what belongs on a phone that can be lost at sea. |
