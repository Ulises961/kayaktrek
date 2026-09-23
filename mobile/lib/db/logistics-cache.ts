import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { ShuttleVehicleSchema, type ShuttleVehicle } from "@shared/dtos/shuttle-vehicle"
import { TravelDocumentSchema, type TravelDocument } from "@shared/dtos/travel-document"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedLogisticsItem } from "./models"

// A trip's travel documents and shuttle vehicles — the Logistics screen, which
// had no cache before and so showed nothing offline. Trip-scoped, wholesale
// replaced per trip like the kit and requirements.
//
// Stored whole (see schema.ts's cached_logistics): the screen is read-only
// offline, a vehicle's passengers are a nested list, and a faithful copy
// parsed back through the shared schema cannot drift from what the screen
// renders the way a hand-picked column set would.
export type LogisticsData = {
  documents: TravelDocument[]
  vehicles: ShuttleVehicle[]
}

const KIND = {
  DOCUMENT: "document",
  VEHICLE: "vehicle",
} as const

export async function saveLogisticsCache(
  tripId: string,
  logistics: LogisticsData,
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedLogisticsItem>("cached_logistics")
  const rows = [
    ...logistics.documents.map((document) => ({ kind: KIND.DOCUMENT, payload: document })),
    ...logistics.vehicles.map((vehicle) => ({ kind: KIND.VEHICLE, payload: vehicle })),
  ]
  await database.write(async () => {
    const stale = await collection.query(Q.where("trip_id", tripId)).fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...rows.map((row, position) =>
        collection.prepareCreate((record) => {
          record.tripId = tripId
          record.kind = row.kind
          record.position = position
          record.payload = JSON.stringify(row.payload)
        }),
      ),
    )
  })
  await markCacheFresh(CACHE_KEY.tripLogistics(tripId), database)
}

export async function loadLogisticsCache(
  tripId: string,
  database: Database = productionDatabase,
): Promise<LogisticsData> {
  const collection = database.collections.get<CachedLogisticsItem>("cached_logistics")
  const rows = await collection.query(Q.where("trip_id", tripId), Q.sortBy("position")).fetch()

  // A row that no longer parses (the DTO changed shape between an app update
  // and the next sweep) is dropped rather than failing the whole screen: the
  // rest of the trip's logistics are still worth showing, and the next sweep
  // rewrites every row anyway.
  const documents: TravelDocument[] = []
  const vehicles: ShuttleVehicle[] = []
  for (const row of rows) {
    const parsed = safeParseJson(row.payload)
    if (row.kind === KIND.DOCUMENT) {
      const document = TravelDocumentSchema.safeParse(parsed)
      if (document.success) documents.push(document.data)
    } else if (row.kind === KIND.VEHICLE) {
      const vehicle = ShuttleVehicleSchema.safeParse(parsed)
      if (vehicle.success) vehicles.push(vehicle.data)
    }
  }
  return { documents, vehicles }
}

function safeParseJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}
