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
// Schema migrations aren't wired yet (no SQLiteAdapter `migrations` passed in
// database.ts) — acceptable while this hasn't shipped to a real device;
// revisit before the first release that could carry an existing local DB.
export const appDatabaseSchema = appSchema({
  version: 2,
  tables: [
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
  ],
})
