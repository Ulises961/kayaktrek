# ADR-017: External GPS device integration — tiered Bluetooth and satellite positioning

**Status**: proposed — MapShare polling and Bluetooth integration require design before M9; satellite communicator abstraction to be designed before any device-specific implementation
**Date**: 2026-05-09

## Context

Sea kayaking expeditions operate in environments with no cell coverage for hours or days. Position tracking under these conditions is both a navigation and a safety concern.

A phone's GPS chip works without cell coverage — it communicates directly with satellites. What cell connectivity provides is A-GPS (assisted GPS), which accelerates the initial fix. Without it, the phone will still track position with a slower cold start. This must be clearly communicated in the UI: *GPS tracking continues without cell signal.*

Despite this, dedicated GPS devices remain worth integrating for three reasons:

- **Accuracy and reliability**: a GPS watch worn on the wrist has a better sky view and more sensitive antenna than a phone in a dry bag in the cockpit.
- **Battery**: continuous GPS on a phone is a significant drain over a multi-day expedition. Dedicated GPS hardware is purpose-built for sustained tracking.
- **Satellite communicators**: devices like the Garmin inReach, SPOT, Zoleo, and Bivy Stick transmit position via satellite networks (Iridium, Globalstar) entirely independent of cellular infrastructure. They carry two-way messaging and SOS buttons. Serious sea kayakers carry these as primary safety devices, not accessories. This category is qualitatively different from GPS watches — it is a safety system, not a convenience.

## Decision

External GPS integration is structured in two independent tiers. They are not mutually exclusive — a paddler may use both simultaneously. The backend is agnostic to all sources: it receives `{ lat, lng, timestamp, trip_id, user_id }` regardless of origin.

---

### Tier 1 — Bluetooth BLE / NMEA (generic, manufacturer-agnostic)

**Scope**: any GPS device that broadcasts over Bluetooth — GPS watches (Garmin Fenix/Instinct, Suunto, Coros), chartplotters, handheld marine GPS units, VHF radios with DSC, generic BLE GPS receivers.

**Why this tier has priority**: it covers the widest range of paddlers regardless of device brand. A paddler does not need a Garmin device. Any Bluetooth GPS source is supported through one of two sub-paths:

- **NMEA 0183 over Bluetooth serial**: the standard marine GPS protocol. Chartplotters and marine handhelds broadcast `$GPRMC` / `$GPGGA` sentences. `react-native-ble-plx` handles the Bluetooth transport; an NMEA parser extracts coordinates. Covers a broad range of existing marine hardware without per-device SDK work.
- **Bluetooth GATT Location and Navigation profile**: standard BLE profile for GPS watches. Covers Garmin, Suunto, and others that expose position via standard profiles or manufacturer SDKs (Garmin Connect IQ).

The mobile client owns a `PositioningSource` abstraction with concrete implementations:

```
PositioningSource (interface)
  ├── PhoneGPSSource              (default, always available)
  ├── NMEABluetoothSource         (Tier 1 — BLE serial, NMEA parser)
  ├── BLEGATTSource               (Tier 1 — standard GATT profile)
  └── SatelliteFeedSource         (Tier 2 — see below)
```

Only one source is active at a time. Phone GPS is the universal fallback.

---

### Tier 2 — Satellite communicator feed polling (server-side, device-agnostic)

**Scope**: satellite communicators that expose a shareable position feed URL — Garmin inReach (MapShare KML), SPOT (shared page feed), Zoleo, Bivy Stick, and future devices.

**How it works**: the user registers their device's sharing feed URL in their app profile. A Celery task on the backend polls that URL at the device's configured tracking interval (typically every 10 minutes at sea), parses the position data, and ingests it as a standard position update — indistinguishable from any other source.

```
User registers feed URL in profile settings
  → Celery beat task polls URL at tracking interval
  → Parses position (KML, JSON, or device-specific format)
  → Ingests as { lat, lng, timestamp, user_id }
  → Position appears on trip tracking view and shore contact link
```

**The phone is not involved**. Position data travels: satellite network → device provider's servers → our backend. This works even when the paddler's phone is off, in a dry bag, or out of Bluetooth range.

**Garmin inReach specifics (researched)**:

- **MapShare KML feeds**: every consumer inReach can enable MapShare, generating a personal feed URL (`https://inreach.garmin.com/feed/Share/[name]`). This returns KML with position, timestamp, battery, and optional messages. No Garmin API account required — the user enables sharing and provides the URL. This is the accessible integration path for consumer devices.
- **IPC Outbound (professional tier)**: a real-time push API where Garmin relays JSON position data to a developer webhook. Requires a Garmin Professional/enterprise account — not available to standard consumer inReach subscriptions. Not applicable to a consumer kayaking app where each user owns their own device. Relevant only if the app ever targets professional guiding operators with fleet accounts.
- **IPC Inbound**: allows sending messages to devices and requesting location updates. Also enterprise-only.

**Other satellite communicators**: SPOT, Zoleo, Bivy Stick, and Ocean Signal offer similar sharing mechanisms with varying feed formats. The polling architecture must be abstracted from day one — a `SatelliteFeedSource` with device-specific parsers (KML, JSON, proprietary) plugged in per provider. Do not build a Garmin-only solution.

**Shore contact integration**: a paddler with a registered satellite feed URL means their shore contact view can display satellite-updated position every 10 minutes, even with the phone off. This is a high-value safety feature at very low implementation cost — the position ingestion pipeline is shared with all other sources.

**SOS integration**: satellite communicator SOS functions (inReach → GEOS IERCC, SPOT → GEOS, Zoleo → IERCC) bypass the app entirely and go directly to emergency response coordination. The app must not attempt to intercept or duplicate this flow. What the app *can* do is surface the SOS contact information and shore contact view prominently, and detect an SOS event via the feed (if the device exposes it) to alert the shore contact through the app.

---

## Consequences

**Positive**
- Tier 1 (Bluetooth) covers the broadest range of paddlers — no specific device required
- Tier 2 (satellite feed) serves the safety-critical use case without requiring Bluetooth proximity or phone involvement
- The `SatelliteFeedSource` abstraction supports multiple device brands from the start — no Garmin lock-in
- Shore contact safety feature gains satellite-quality position at near-zero additional cost
- Backend position ingestion is unchanged — all sources produce the same message format
- Phone GPS as universal fallback means no external hardware is required to use the app

**Negative / trade-offs**
- Tier 1: Bluetooth permissions, device discovery UX, and background Bluetooth add mobile client complexity
- Tier 2: polling is not real-time — position is as fresh as the device's tracking interval (10 min typical). Not suitable for live expedition tracking on a minute-by-minute basis.
- Tier 2: each satellite communicator provider has its own feed format and terms of service — parser maintenance grows with supported devices
- KML feed polling depends on Garmin (and other providers) maintaining their feed URLs — a provider changing their API breaks the integration

**Risks / open questions**

- **SatelliteFeedSource abstraction design**: define the parser interface before implementing any device-specific parser. The interface must accommodate KML, JSON, and proprietary formats. Design this before M9.
- **Feed URL authentication**: some providers (Zoleo, Bivy Stick) may require authentication on the feed URL. The user profile must be able to store credentials or tokens alongside the feed URL, stored encrypted.
- **Polling frequency and rate limits**: Garmin MapShare does not publish rate limit documentation. Test polling behaviour before relying on it in production. Back off gracefully on 429 responses.
- **Bluetooth + satellite simultaneously**: a paddler may have both a Bluetooth GPS watch and an inReach. Define which source takes priority and whether positions from multiple sources are merged or the active source is selected exclusively.
- **iOS background constraints**: iOS restricts background Bluetooth and location for non-navigation apps. The app will need `Always` location permission and background modes declared in `Info.plist`. Evaluate whether Expo managed workflow supports this or whether a bare workflow is required for Tier 1.
- **SPOT / Zoleo / Bivy Stick feed research**: the same research done for Garmin MapShare must be done for each provider before implementing their parser. Do not assume feed format compatibility.
