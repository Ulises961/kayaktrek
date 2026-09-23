import { appSchema, tableSchema } from "nitromelondb/Schema"

// Local WatermelonDB(-compatible) schema for M9c WP2 — mirrors the per-aggregate
// shape docs/mobile/sync-protocol-spec.md §4 chose: days/points sync as one
// atomic subtree (Services/itinerary_route_sync_service.py, wired in WP4),
// everything else (trip_members, requirement_contributions, weather(+states),
// sea(+states)) syncs per-row through Services/mobile_sync_service.py's
// pullChanges (wired below in sync.ts).
//
// Column names are snake_case, the WatermelonDB/NitromelonDB convention (raw
// sync records are applied by column name, not through a model's camelCase
// decorators) — sync.ts's per-table mappers translate the API's camelCase
// field names (mobile_sync_service.py / itinerary_route_sync_service.py) to
// these column names before handing rows to `synchronize()`.
// Migrations are wired (database.ts passes `migrations` from migrations.ts) —
// every `version` bump here needs a matching migration step there, or a
// device with an existing local DB throws "no such table"/"no such column" on
// whatever the bump added. Confirmed the hard way: v4 -> v5 shipped without
// one, real installs already on v4 immediately hit "no such table:
// cached_connections" once the app started reading from it.
export const appDatabaseSchema = appSchema({
  version: 9,
  tables: [
    tableSchema({
      // When each cached surface was last successfully refreshed from the
      // network — one row per key (CACHE_KEY in cache-freshness.ts), upserted.
      // Deliberately NOT folded into `sync_cursors` below: that column is a
      // protocol value sent back to the server on the next delta pull, while
      // this one is a display value answering "how old is what I'm looking
      // at". Most cached surfaces (trip list, logs, buddies, gear, kit,
      // requirements, the route) are wholesale replaces with no delta cursor
      // at all, so they have nothing in `sync_cursors` to read in the first
      // place.
      //
      // M9c WP7 makes this a precondition for widening sync scope rather than
      // a follow-up to it (docs/adr/mobile-offline.md, "Staleness must be
      // expressed, not implied"): a screen could previously only say *you are
      // offline*, never *this is from Tuesday*, and a three-day-old forecast
      // that renders identically to a live one is a safety problem, not an
      // untidiness.
      name: "cache_freshness",
      columns: [
        { name: "key", type: "string", isIndexed: true },
        { name: "cached_at", type: "number" },
      ],
    }),
    tableSchema({
      // WatermelonDB's synchronize() persists exactly one `lastPulledAt` cursor,
      // keyed to the whole local database (`__watermelon_last_pulled_at` — see
      // nitromelondb/sync/impl/index.js). That's fine for one remote source, but
      // sync.ts calls synchronize() once per trip against a trip-scoped pull
      // endpoint — the library's single global cursor was getting stamped by
      // whichever trip synced most recently, so the next trip's pull sent a
      // cursor that had nothing to do with its own sync history and the backend
      // (correctly) reported "nothing changed since" for data it had never sent
      // that trip at all. One row per trip here, read/written by sync.ts
      // directly instead of relying on the library's own bookkeeping.
      name: "sync_cursors",
      columns: [
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "last_pulled_at", type: "number" },
      ],
    }),
    tableSchema({
      // Not part of docs/mobile/sync-protocol-spec.md §4's aggregate list — that
      // spec is entirely trip-scoped (every pull endpoint takes a tripId), and
      // never covered "which trips am I on" at all. This is a much simpler,
      // separate cache (WP6): whatever GET /trip/<user_id>/all last returned
      // successfully, wholesale-replaced on every successful fetch, read as a
      // fallback when that fetch fails (offline). No delta, no tombstones — the
      // trip list is small and always fetched in full.
      name: "trips",
      columns: [
        { name: "destination", type: "string", isOptional: true },
        { name: "state", type: "string", isOptional: true },
        { name: "date_from", type: "string", isOptional: true },
        { name: "date_to", type: "string", isOptional: true },
        { name: "traveller_count", type: "number" },
      ],
    }),
    tableSchema({
      name: "days",
      columns: [
        // Not part of the wire format (Services/itinerary_route_sync_service.py's
        // pull_route response has no tripId per day) — added locally (WP4) so a
        // wholesale route replace can be scoped to one trip, never wiping every
        // cached trip's route.
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "day_number", type: "number" },
        { name: "date", type: "string", isOptional: true },
        { name: "start_point_id", type: "string", isOptional: true },
        { name: "end_point_id", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      name: "route_meta",
      columns: [
        // One row per trip — the route_version pulled alongside the last
        // wholesale replace (spec §8.1). Inert for M9c's read-only case;
        // M9d's push/divergence-detection needs it as the base version.
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "route_version", type: "number" },
      ],
    }),
    tableSchema({
      name: "points",
      columns: [
        { name: "day_id", type: "string", isIndexed: true },
        { name: "order_key", type: "string", isOptional: true },
        { name: "latitude", type: "number", isOptional: true },
        { name: "longitude", type: "number", isOptional: true },
        { name: "name", type: "string", isOptional: true },
        { name: "notes", type: "string", isOptional: true },
        { name: "type", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      name: "trip_members",
      columns: [
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "user_id", type: "string" },
        // Not device-writable — carried so the offline float-plan crew
        // manifest (WP6) can show a name, not just an opaque userId.
        { name: "user_name", type: "string", isOptional: true },
        { name: "user_surname", type: "string", isOptional: true },
        { name: "user_username", type: "string", isOptional: true },
        { name: "role", type: "string" },
        { name: "nominated_successor", type: "boolean" },
        { name: "vessel_make", type: "string", isOptional: true },
        { name: "vessel_model", type: "string", isOptional: true },
        { name: "vessel_length_cm", type: "number", isOptional: true },
        { name: "vessel_color_primary", type: "string", isOptional: true },
        { name: "vessel_color_secondary", type: "string", isOptional: true },
        { name: "emergency_contact_name", type: "string", isOptional: true },
        { name: "emergency_contact_phone", type: "string", isOptional: true },
        { name: "emergency_contact_relationship", type: "string", isOptional: true },
        { name: "float_plan_confirmed_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "requirement_contributions",
      columns: [
        { name: "requirement_id", type: "string", isIndexed: true },
        { name: "trip_member_id", type: "string", isIndexed: true },
        { name: "item_id", type: "string" },
        { name: "checked", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "weather",
      columns: [
        { name: "day_id", type: "string", isIndexed: true },
        { name: "model", type: "string", isOptional: true },
        { name: "fetched_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "weather_states",
      columns: [
        { name: "day_id", type: "string", isIndexed: true },
        { name: "time", type: "string" },
        { name: "temperature", type: "number", isOptional: true },
        { name: "precipitation", type: "number", isOptional: true },
        { name: "wind_direction", type: "number", isOptional: true },
        { name: "wind_force", type: "number", isOptional: true },
        { name: "cloud", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      name: "sea",
      columns: [
        { name: "day_id", type: "string", isIndexed: true },
        { name: "moon_phase", type: "string", isOptional: true },
        { name: "high_tide", type: "string", isOptional: true },
        { name: "low_tide", type: "string", isOptional: true },
        { name: "tidal_range_m", type: "number", isOptional: true },
        { name: "tidal_source", type: "string", isOptional: true },
        { name: "recorded_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "sea_states",
      columns: [
        { name: "day_id", type: "string", isIndexed: true },
        { name: "time", type: "string" },
        { name: "wave_height", type: "number", isOptional: true },
        { name: "wave_direction", type: "number", isOptional: true },
        { name: "swell_wave_height", type: "number", isOptional: true },
        { name: "swell_direction", type: "number", isOptional: true },
        { name: "swell_period", type: "number", isOptional: true },
        { name: "current_speed", type: "number", isOptional: true },
        { name: "current_direction", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      // Not trip-scoped (unlike everything above) — a paddler's own buddy list,
      // wholesale-replaced on every successful fetch, same simple "last good
      // fetch, no delta" shape as `trips`. `id` is the connection id.
      name: "cached_connections",
      columns: [
        { name: "status", type: "string" },
        { name: "requester_id", type: "string", isOptional: true },
        { name: "requester_username", type: "string" },
        { name: "requester_name", type: "string" },
        { name: "requester_surname", type: "string", isOptional: true },
        { name: "addressee_id", type: "string", isOptional: true },
        { name: "addressee_username", type: "string" },
        { name: "addressee_name", type: "string" },
        { name: "addressee_surname", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      // Same shape as `cached_connections` — `id` is the block id.
      name: "cached_blocks",
      columns: [
        { name: "blocked_id", type: "string", isOptional: true },
        { name: "blocked_username", type: "string" },
        { name: "blocked_name", type: "string" },
        { name: "blocked_surname", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      // A paddler's own logs, wholesale-replaced on every successful fetch.
      // `kind` distinguishes "mine" from "endorsed" — the two are disjoint (a
      // log can't be both your own and someone else's you endorsed), so a
      // shared `id` space is safe. Only the fields LogCard actually renders —
      // full detail (notes, route geometry, endorsers) has no offline reader.
      name: "cached_logs",
      columns: [
        { name: "kind", type: "string", isIndexed: true },
        { name: "date", type: "string", isOptional: true },
        { name: "hours", type: "number", isOptional: true },
        { name: "distance", type: "number", isOptional: true },
        { name: "avg_sea", type: "number", isOptional: true },
        { name: "endorsement_count", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      // The trip inventory's requirement checklist (Items screen, "Group" tab),
      // wholesale-replaced per trip on every successful fetch — trip-scoped,
      // unlike cached_logs/cached_connections/cached_blocks. Only name/status:
      // who's covering what (contributions, proposedBy) has no offline reader,
      // same trim as cached_logs dropping notes/geometry/endorsers. Covering,
      // adding, and removing a requirement all need a connection regardless.
      name: "cached_requirements",
      columns: [
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "name", type: "string" },
        { name: "status", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      // The user's gear closet (`Item`, user_id-owned) — trip-INDEPENDENT, so
      // there is no trip_id here and the table replaces wholesale, the same
      // shape as `trips`. Distinct from cached_packing_items below, which is
      // the per-trip list drawn FROM this closet.
      //
      // Before this existed, getMyItems' result was fetched inside the Items
      // screen's requirements loader and never restored on the offline path,
      // so an offline device rendered "No owned gear to contribute yet." — a
      // silent lie rather than an error, and the exact question ("did I pack
      // the spare paddle") that gets asked at a put-in with no signal.
      name: "cached_gear",
      columns: [
        { name: "name", type: "string" },
        { name: "status", type: "string", isOptional: true },
        // Added at v9, when M30 WP5's Gear screen became a second offline
        // reader of this cache. The comment above was written when the only
        // reader was the Items screen's contribute list, which needs a name and
        // a status; the Gear screen groups by category and renders M10's
        // default-pack flag, so dropping both left it unable to render
        // faithfully — an item would have shown as unfiled and not-default
        // regardless of what it actually is.
        { name: "category_name", type: "string", isOptional: true },
        { name: "default_pack", type: "boolean", isOptional: true },
      ],
    }),
    tableSchema({
      // A member's private per-trip packing list (`PersonalPackingItem`) —
      // trip-scoped like cached_requirements, and denormalised: the item's
      // name is copied in rather than joined from cached_gear, so a kit entry
      // still renders if the closet cache is empty or the gear was deleted.
      // `checked` is the packed/unpacked state, which is the whole reason to
      // read this offline at all.
      name: "cached_packing_items",
      columns: [
        { name: "trip_id", type: "string", isIndexed: true },
        { name: "item_id", type: "string", isOptional: true },
        { name: "item_name", type: "string" },
        { name: "checked", type: "boolean", isOptional: true },
      ],
    }),
  ],
})
