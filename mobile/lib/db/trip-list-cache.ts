import type { Database } from "nitromelondb"

import type { Trip, TripState } from "@shared/dtos/trip"
import { TRIP_STATES } from "@shared/dtos/trip"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { TripSummary } from "./models"

// Exactly the fields components/trips/trip-card.tsx renders — a card doesn't
// need the full Trip DTO (travellers as full TripMember objects, medical
// fields, etc.), and coupling it to that full shape is what made an offline
// cache path awkward in the first place.
export type TripCardData = {
  id: string
  destination: string | null
  state: TripState | null
  dateFrom: string | null
  dateTo: string | null
  travellerCount: number
}

function asTripState(value: string | null): TripState | null {
  return value !== null && (TRIP_STATES as readonly string[]).includes(value) ? (value as TripState) : null
}

export function toTripCardData(trip: Trip): TripCardData {
  return {
    id: trip.id ?? "",
    destination: trip.destination ?? null,
    state: asTripState(trip.state ?? null),
    dateFrom: trip.dateFrom ?? null,
    dateTo: trip.dateTo ?? null,
    travellerCount: trip.travellers?.length ?? 0,
  }
}

export async function saveTripListCache(trips: Trip[], database: Database = productionDatabase): Promise<void> {
  const collection = database.collections.get<TripSummary>("trips")
  await database.write(async () => {
    const stale = await collection.query().fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...trips
        .filter((trip): trip is Trip & { id: string } => Boolean(trip.id))
        .map((trip) =>
          collection.prepareCreateFromDirtyRaw({
            id: trip.id,
            destination: trip.destination ?? null,
            state: trip.state ?? null,
            date_from: trip.dateFrom ?? null,
            date_to: trip.dateTo ?? null,
            traveller_count: trip.travellers?.length ?? 0,
          })
        )
    )
  })
  // Recorded inside the save, not by the caller — every cached surface owes an
  // age to whatever renders it (M9c WP7), and a caller that forgets produces a
  // screen that silently shows undated stale data.
  await markCacheFresh(CACHE_KEY.tripList, database)
}

export async function loadTripListCache(database: Database = productionDatabase): Promise<TripCardData[]> {
  const collection = database.collections.get<TripSummary>("trips")
  const rows = await collection.query().fetch()
  return rows.map((row) => ({
    id: row.id,
    destination: row.destination ?? null,
    state: asTripState(row.state),
    dateFrom: row.dateFrom ?? null,
    dateTo: row.dateTo ?? null,
    travellerCount: row.travellerCount ?? 0,
  }))
}
