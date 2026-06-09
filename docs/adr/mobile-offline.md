# Mobile & Offline: Sync Protocol, Conflict Resolution, GPS Integration

This document covers the design of the React Native mobile client (M9) — why offline-first is non-negotiable for a maritime app, how the local and server databases are kept in sync, how conflicts are resolved, what gets synced and what doesn't, and how external GPS devices fit into the position-tracking model.

This is the most architecturally complex milestone in the project. Nothing here should be coded before the WatermelonDB schema is written as a full design document and reviewed against the final server schema.

---

## Why offline-first

Sea kayaking expeditions happen in remote coastal environments where mobile connectivity is intermittent or absent for hours or days at a time. A mobile app that requires a network connection is not useful at sea.

The mobile client must support the core expedition use cases — viewing the planned route, checking in, updating position, reviewing day conditions — without connectivity. Mutations made offline must be durably queued and replayed when connectivity is restored.

This is not a "nice to have": it is the primary use case.

---

## Architecture overview

The mobile client is **offline-first**: it maintains a local WatermelonDB database (SQLite-backed, React Native) as its source of truth. The local DB is a denormalised subset of the main PostgreSQL schema containing only data relevant to the user's active and upcoming trips.

```
Device (WatermelonDB / SQLite)
  ├── Sync down: server → device (full entity snapshots on reconnection)
  ├── Sync up: device → server (mutation queue via RabbitMQ)
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

**Sync down protocol**: the server needs to know which entities have changed since the device last synced. A `last_synced_at` timestamp per trip per device, combined with `updated_at` on all entities, is the simplest approach. On reconnection, the device sends its `last_synced_at` per trip; the server returns all entities where `updated_at > last_synced_at`. This protocol must be fully specified in the M9 design document — it is referenced here but not yet built.

---

## Weather and sea data — read-only cache, refresh on reconnection

Weather and sea state data is a primary offline concern. A paddler at sea must be able to see the forecast for the days ahead when connectivity drops. It is included in the offline cache as part of sync-down.

**Key distinctions from other synced data**:
- Weather/sea data is **read-only on the device** — the mobile client never mutates it. There are no weather mutations to queue to RabbitMQ.
- It is produced by the backend's Celery weather-fetch task (OpenMeteo, 6h TTL), not by user action.
- The backend stops refreshing weather rows once a trip transitions to `past` — the server's copy is frozen at whatever the last fetch was.

**On reconnection, the freshness check is**:

```
for each day in synced trip:
    if server.weather.updated_at > device.cached_weather.updated_at:
        pull full Weather + Sea rows for that day
```

This is a simple timestamp comparison applied to every day's weather/sea rows — regardless of whether those hours have already passed. A device that was offline yesterday and reconnects today should receive updated rows for yesterday's hours if the server fetched a fresher version while the device was offline. The whole row is replaced (same replace-the-whole-entity principle as all other sync-down data).

**"Forecast as of [timestamp]"**: the cached `updated_at` is displayed in the UI so the paddler knows exactly how fresh the forecast is without any guessing. This label is always shown — not only when data is stale.

**After a trip transitions to `past`**: the Celery fetch task no longer refreshes weather rows for that trip. The device may pull a final sync on reconnection if the server's `updated_at` is newer than the device's cache, after which the data is effectively immutable. No special case is needed — the timestamp comparison handles it correctly by definition.

---

## Sync up — mutation queue via RabbitMQ

Mutations made offline are published to **RabbitMQ** when connectivity is restored. The backend consumes them in device-timestamp order and applies them via the standard service layer. RabbitMQ durability means the queue survives a broker restart — mutations are not lost if the device reconnects briefly and drops again.

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

RabbitMQ delivers at-least-once. The backend consumer checks `mutation_id` against a processed-mutations log before applying. If already seen, the message is acknowledged and skipped silently. The processed-mutations table is append-only; it can be pruned after a safe retention window (90 days is a reasonable starting point — balance storage cost against the need to detect very late redeliveries).

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
- Tile source is our own MinIO proxy (OSM base tiles) and titiler (Sentinel-2 satellite) — same origin as the web client
- MIT licensed; no usage fees regardless of load volume
- API close enough to Mapbox RN that if a migration back to Mapbox ever became necessary, the effort would be minimal

The web client stays on react-leaflet. The backend remains SDK-agnostic (raw WGS84 coordinates only). The tile serving infrastructure (MinIO proxy + titiler) is shared between web PWA offline cache and mobile MapLibre offline regions.

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

3. **Expo managed vs bare workflow**: iOS background location and Bluetooth (Tier 1) may require capabilities unavailable in Expo's managed workflow. Evaluate before committing.

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
