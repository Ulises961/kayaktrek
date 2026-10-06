import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"
import { synchronize } from "nitromelondb/sync"
import type { SyncDatabaseChangeSet, SyncPullResult, SyncTableChangeSet } from "nitromelondb/sync"

import { apiGet } from "../api/client"
import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import type { SyncCursor } from "./models"

// Backend field name (camelCase, Services/mobile_sync_service.py) -> local
// WatermelonDB column name (snake_case, schema.ts). "id" is never listed —
// it already matches on both sides.
const FIELD_MAPS: Record<string, Record<string, string>> = {
  trip_members: {
    tripId: "trip_id",
    userId: "user_id",
    userName: "user_name",
    userSurname: "user_surname",
    userUsername: "user_username",
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
    leftAt: "left_at",
    leftNote: "left_note",
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
  velocity_days: {
    dayId: "day_id",
    south: "south",
    north: "north",
    west: "west",
    east: "east",
    size: "size",
    landMask: "land_mask",
  },
  velocity_hours: {
    dayId: "day_id",
    hour: "hour",
    windU: "wind_u",
    windV: "wind_v",
    waveU: "wave_u",
    waveV: "wave_v",
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

// nitromelondb's synchronize() persists exactly one lastPulledAt cursor, keyed
// to the whole local `database` (not to whatever remote endpoint the caller's
// pullChanges happens to hit that time). We call synchronize() once per trip
// against a trip-scoped endpoint, so the library's own bookkeeping doesn't fit:
// syncing trip A and then trip B would hand trip B's pull the cursor trip A's
// sync just advanced to, and the backend correctly reports "nothing changed
// since then" for data it has never sent that trip at all — trip B's weather/
// sea/crew cache silently never populates (or a previously-populated trip's
// cache stops refreshing once a different trip is synced after it). Tracked
// here instead, one row per trip in `sync_cursors`, ignoring the argument
// synchronize() passes into pullChanges and the value it writes back.
async function getCursor(tripId: string, database: Database): Promise<number | null> {
  const row = await database.collections
    .get<SyncCursor>("sync_cursors")
    .query(Q.where("trip_id", tripId))
    .fetch()
  return row[0]?.lastPulledAt ?? null
}

async function setCursor(tripId: string, timestamp: number, database: Database): Promise<void> {
  const collection = database.collections.get<SyncCursor>("sync_cursors")
  const existing = await collection.query(Q.where("trip_id", tripId)).fetch()
  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update((row) => {
        row.lastPulledAt = timestamp
      })
    } else {
      await collection.create((row) => {
        row.tripId = tripId
        row.lastPulledAt = timestamp
      })
    }
  })
}

// Pull-only: changes made on the phone go up through the mutation queue
// (lib/db/mutation-queue.ts, M9d), never pushChanges. Per-row aggregates only (trip_members,
// requirement_contributions, weather(+states), sea(+states)); the route
// (days/points) syncs through its own atomic channel, wired separately in
// WP4, never through this generic delta engine (spec §7.1/§8.2).
export async function syncTrip(tripId: string, database: Database = productionDatabase): Promise<void> {
  // Captured in pullChanges, written only once synchronize() has committed.
  // Writing it inside pullChanges — where it used to be — advanced the cursor
  // for data that had not landed yet: if applying the changes then failed, the
  // next pull asked "what changed since then?" and the backend correctly
  // answered "nothing" for rows it had never delivered, so that delta was
  // skipped permanently. Found on a device, where a trip reported a successful
  // sync, recorded a freshness timestamp, and had no crew at all.
  //
  // Same class of bug as b181d85a's per-trip cursor fix: a cursor advancing for
  // data that never arrived. There the cursor was wrong; here it was right and
  // written at the wrong moment.
  let pulledAt: number | null = null

  await synchronize({
    database,
    pullChanges: async () => {
      const cursor = await getCursor(tripId, database)
      const query = cursor ? `?lastPulledAt=${cursor}` : ""
      const response = await apiGet<ApiPullChanges>(`/api/sync/trip/${tripId}/pull${query}`)
      pulledAt = response.timestamp
      const result: SyncPullResult = {
        changes: remapChanges(response.changes),
        timestamp: response.timestamp,
      }
      return result
    },
  })

  if (pulledAt !== null) await setCursor(tripId, pulledAt, database)

  // Marked after synchronize() resolves, not inside pullChanges: a pull whose
  // changes fail to apply locally has not refreshed anything, and dating the
  // cache from it would overstate how current the crew/weather/sea rows are.
  await markCacheFresh(CACHE_KEY.tripSync(tripId), database)
}
