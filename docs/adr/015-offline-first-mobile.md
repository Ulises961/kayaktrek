# ADR-015: Offline-first mobile — sync protocol, conflict resolution, and map SDK

**Status**: accepted — implementation deferred to M9; sync contract must be reviewed against final WatermelonDB schema before coding begins
**Date**: 2026-05-09

## Context

Sea kayaking expeditions happen in remote coastal environments where mobile connectivity is intermittent or absent for hours or days at a time. A mobile app that requires a network connection is not useful at sea.

The mobile client (M9, React Native) must support the core expedition use cases — viewing the planned route, checking in, updating position — without connectivity. Mutations made offline must be durably queued and replayed when connectivity is restored.

This is the most architecturally complex milestone in the project.

## Decision

The mobile client is **offline-first**: it maintains a local WatermelonDB database (SQLite-backed) as its source of truth. The local DB is a denormalised subset of the main schema containing only data relevant to the user's active and upcoming trips.

---

### Sync architecture

- **Sync down** (server → device): on reconnection, the device pulls full entity snapshots for its subscribed trips. Field-level diffs are not used — entity snapshots are small enough at this domain scale that the simplicity of replace-the-whole-entity is worth more than the bandwidth saving of diffs.
- **Sync up** (device → server): mutations queued while offline are published to RabbitMQ when connectivity is restored. The backend consumes them in device-timestamp order and applies them via the standard service layer. RabbitMQ durability means the queue survives a broker restart — mutations are not lost if the device reconnects briefly and drops again.
- **Live position**: when connected during a `happening` trip, position updates go directly via Redis pub/sub — ephemeral, low-latency, outside the queue. Position data is not queued when offline: it is only meaningful in real-time during an active expedition.
- **Multi-source position per user**: a crew member may have multiple active position sources simultaneously — phone GPS reporting every 30 seconds and a satellite communicator polled every 10 minutes, for example. These are not in conflict: each crew member owns their own position track, and for a given user the **latest event timestamp wins**. The comparison must be on the event timestamp (when the device recorded the position at sea), not the ingestion timestamp (when the server received it). Satellite relay introduces latency — an inReach position may arrive at the server after a phone position even though the inReach reading is older. Comparing by ingestion time would surface stale data as current. All position events are stored with their source tagged (`phone_gps`, `inreach_mapshare`, `nmea_bluetooth`, etc.) and their event timestamps. The current position displayed (shore contact view, expedition tracking view) is the most recent event timestamp for that user across all sources. The full tracking history is the union of all sources.
- **Sync trigger**: app foreground and reconnection event. No periodic background polling — the battery cost is not justified for a use case where connectivity is binary (you either have it or you don't at sea).

---

### What is synced to the device

Only active and upcoming trips (`draft`, `planning`, `happening`). For each:

| Data | Synced |
|------|--------|
| Trip metadata (title, state, dates) | Yes |
| Full itinerary — days + points (coordinates, type, name, notes) | Yes — primary navigation data, must be available offline |
| Crew list — names, emergency contacts (leader view), check-in status | Yes |
| Own float plan fields | Yes |
| Inventory checklist — required items, who is covering what | Yes — useful at launch and at sea |
| Full user profiles of other crew | No |
| Past trips | No — read-only history, accessible when connected |
| Trip logistics and reservations | No — pre-departure only, useful while connected |
| GDPR export data | No |
| Weather / sea data | No — cached separately when connected, not a primary offline concern |

---

### Conflict resolution

Conflict resolution is governed by trip state, not a single global rule. The distinction reflects who has ground truth at each point in the lifecycle.

**Non-active trips** (`draft`, `planning`, `past`, `archived`): **server wins** for all shared trip data. Offline edits to a trip that is not currently underway are unusual; the server holds the authoritative planned state. Device wins only for the user's own personal data (their own float plan fields, their own notes).

**Active expedition** (`happening`): **device mutations are applied unconditionally**, in device-timestamp order. The crew on the water have information the server does not — a reroute made at sea because of weather, a check-in at a waypoint, an incident note. A server-wins rule during a live expedition would overwrite real events with a stale snapshot. That is the wrong call.

In practice, the role model eliminates most conflict scenarios within a `happening` trip:
- Route edits are leader-only → no crew vs leader conflict possible
- Check-ins are per-user → no conflict possible
- Position updates are per-user and ephemeral → no conflict possible
- Inventory contributions are per-item per-user → last-write-wins by device timestamp is sufficient

The one remaining edge case — the leader using two devices offline simultaneously and editing the same point on both — is resolved by last-write-wins on device timestamp. This is an acceptable trade-off for an extremely rare scenario.

---

### Idempotency

RabbitMQ delivers at-least-once. Every queued mutation carries:

| Field | Purpose |
|-------|---------|
| `mutation_id` | UUID v7 generated on the device at mutation time — stable identity across retries |
| `entity_type` | e.g. `point`, `check_in`, `trip_member` |
| `entity_id` | UUID of the entity being mutated |
| `operation` | `create`, `update`, or `delete` |
| `payload` | Full entity snapshot for create/update; empty for delete |
| `device_timestamp` | ISO 8601 timestamp of when the mutation occurred on the device |
| `user_id` | Identity of the user who made the mutation |

The backend consumer checks `mutation_id` against a processed-mutations log before applying. If already seen, the message is acknowledged and skipped silently. This table is append-only and can be pruned after a safe retention window (e.g. 90 days).

---

### Map SDK: Mapbox Native

`react-native-maps` wraps Google Maps / Apple Maps, both of which have severely limited offline tile support. Pre-downloading a coastal region for use without connectivity is not supported.

**Mapbox Native** is chosen for the mobile client:
- First-class offline region download including satellite imagery — a safety feature for maritime navigation (consistent with ADR-006: satellite imagery is how paddlers make go/no-go decisions)
- Multi-constellation GPS support in Mapbox layers
- Free tier: 25,000 mobile loads/month — manageable at early stage

The web client stays on Leaflet. The mobile client uses Mapbox Native. The backend is agnostic to both per ADR-006: it stores raw WGS84 coordinates only, no SDK-specific formats.

---

### Authentication

React Native cannot use httpOnly cookies (ADR-001). The mobile client stores tokens in **`expo-secure-store`**:
- iOS: hardware-backed Keychain
- Android: hardware-backed Keystore (API 23+)

Android below API 23 (Android 6.0, released 2015) is not supported — hardware-backed storage is not guaranteed below this level, and effectively no devices in current use are below it. The JWT contract (access + refresh tokens) is unchanged from the web client; only the storage mechanism differs.

---

## Consequences

**Positive**
- Core expedition functionality works without connectivity — the primary use case is served
- Full entity snapshots simplify conflict detection — no partial-update merge logic
- The `happening`-state device-wins rule preserves real events that occurred at sea
- RabbitMQ durability means no mutations are lost due to brief reconnection windows
- Mapbox offline tile download is a direct safety benefit — pre-loaded charts work at sea
- Idempotent mutation processing makes the sync consumer robust to RabbitMQ redelivery

**Negative / trade-offs**
- WatermelonDB requires a denormalised schema that diverges from the normalised main schema — two schemas to maintain
- Full entity snapshots are slightly less bandwidth-efficient than diffs — acceptable at this data scale
- Mapbox Native has usage-based pricing; monitor load counts as the user base grows
- The processed-mutations log table grows over time and requires periodic pruning

**Risks / open questions**

- **WatermelonDB schema design**: the denormalised mobile schema must be designed as a written spec before any M9 code is written. It must cover all synced entities, their relationships, and the fields required for offline use. This is not derivable from the main schema without deliberate design work.
- **Sync down protocol**: full entity snapshots on reconnection require the server to know which entities have changed since the device last synced. A `last_synced_at` timestamp per trip per device, combined with `updated_at` on all entities, is the simplest approach. Define this protocol in the M9 spec.
- **Mapbox offline tile management**: the user must explicitly download a region before departure. Design the pre-departure checklist (ROADMAP) to include an "offline map downloaded" step. Define a maximum tile storage limit per device.
- **Expo managed vs bare workflow**: iOS background location and Bluetooth (for ADR-017 Tier 1) may require capabilities not available in Expo's managed workflow. Evaluate before committing to the managed workflow for M9.
- **Processed-mutations table retention**: define the pruning window before the table is created. 90 days is a starting point — balance storage cost against the need to detect very late redeliveries.
