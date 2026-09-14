import type { Database } from "nitromelondb"
import { synchronize } from "nitromelondb/sync"
import type { SyncDatabaseChangeSet, SyncPullResult, SyncTableChangeSet } from "nitromelondb/sync"

import { apiGet } from "../api/client"
import { database as productionDatabase } from "./database"

// Backend field name (camelCase, Services/mobile_sync_service.py) -> local
// WatermelonDB column name (snake_case, schema.ts). "id" is never listed —
// it already matches on both sides.
const FIELD_MAPS: Record<string, Record<string, string>> = {
  trip_members: {
    tripId: "trip_id",
    userId: "user_id",
    role: "role",
    nominatedSuccessor: "nominated_successor",
    vesselMake: "vessel_make",
    vesselModel: "vessel_model",
    vesselLengthCm: "vessel_length_cm",
    vesselColorPrimary: "vessel_color_primary",
    vesselColorSecondary: "vessel_color_secondary",
    emergencyContactName: "emergency_contact_name",
    emergencyContactPhone: "emergency_contact_phone",
    emergencyContactRelationship: "emergency_contact_relationship",
    floatPlanConfirmedAt: "float_plan_confirmed_at",
  },
  requirement_contributions: {
    requirementId: "requirement_id",
    tripMemberId: "trip_member_id",
    itemId: "item_id",
    checked: "checked",
  },
  weather: {
    dayId: "day_id",
    model: "model",
    fetchedAt: "fetched_at",
  },
  weather_states: {
    dayId: "day_id",
    time: "time",
    temperature: "temperature",
    precipitation: "precipitation",
    windDirection: "wind_direction",
    windForce: "wind_force",
    cloud: "cloud",
  },
  sea: {
    dayId: "day_id",
    moonPhase: "moon_phase",
    highTide: "high_tide",
    lowTide: "low_tide",
    tidalRangeM: "tidal_range_m",
    tidalSource: "tidal_source",
    recordedAt: "recorded_at",
  },
  sea_states: {
    dayId: "day_id",
    time: "time",
    waveHeight: "wave_height",
    waveDirection: "wave_direction",
    swellWaveHeight: "swell_wave_height",
    swellDirection: "swell_direction",
    swellPeriod: "swell_period",
    currentSpeed: "current_speed",
    currentDirection: "current_direction",
  },
}

function remapRow(row: Record<string, unknown>, fieldMap: Record<string, string>): Record<string, unknown> {
  const remapped: Record<string, unknown> = { id: row.id }
  for (const [apiField, column] of Object.entries(fieldMap)) {
    remapped[column] = row[apiField]
  }
  return remapped
}

type ApiPullChanges = {
  changes: Record<string, { created: Record<string, unknown>[]; updated: Record<string, unknown>[]; deleted: string[] }>
  timestamp: number
}

function remapChanges(apiChanges: ApiPullChanges["changes"]): SyncDatabaseChangeSet {
  const remapped: SyncDatabaseChangeSet = {}
  for (const [table, bucket] of Object.entries(apiChanges)) {
    const fieldMap = FIELD_MAPS[table]
    if (!fieldMap) continue // route tables (days/points) don't sync through this channel — see WP4
    remapped[table] = {
      created: bucket.created.map((row) => remapRow(row, fieldMap)),
      updated: bucket.updated.map((row) => remapRow(row, fieldMap)),
      deleted: bucket.deleted,
    } satisfies SyncTableChangeSet
  }
  return remapped
}

// Pull-only (WP2) — no pushChanges yet. Per-row aggregates only (trip_members,
// requirement_contributions, weather(+states), sea(+states)); the route
// (days/points) syncs through its own atomic channel, wired separately in
// WP4, never through this generic delta engine (spec §7.1/§8.2).
export async function syncTrip(tripId: string, database: Database = productionDatabase): Promise<void> {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const query = lastPulledAt ? `?lastPulledAt=${lastPulledAt}` : ""
      const response = await apiGet<ApiPullChanges>(`/api/sync/trip/${tripId}/pull${query}`)
      const result: SyncPullResult = {
        changes: remapChanges(response.changes),
        timestamp: response.timestamp,
      }
      return result
    },
  })
}
