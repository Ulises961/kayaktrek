import { useEffect, useState } from "react"

import type { Difficulty } from "@shared/dtos/difficulty"
import type { Trip, TripState } from "@shared/dtos/trip"

import { CACHE_KEY } from "../db/cache-freshness"
import { loadTripListCache } from "../db/trip-list-cache"
import { isTripLeader } from "../db/trip-role"
import { useLiveCache } from "../db/use-live-cache"
import { useTripChanges } from "../live/use-trip-changes"
import { getTrip } from "./actions"

// The fields the trip header renders. Both the live Trip DTO and the trip-list cache's
// TripCardData map into this shape, so the header does not branch on source. `difficulty`
// and `pausedAt` are null offline: the trip-list cache is card data and carries neither.
export type TripHeaderView = {
  destination: string | null
  state: TripState | null
  dateFrom: string | null
  dateTo: string | null
  difficulty: Difficulty | null
  // Offline this reads as not paused, and a pause queued on this phone is laid over it
  // (TripControls).
  isPaused: boolean
  pausedAt: string | null
}

function toHeaderView(trip: Trip): TripHeaderView {
  return {
    destination: trip.destination ?? null,
    state: trip.state ?? null,
    dateFrom: trip.dateFrom ?? null,
    dateTo: trip.dateTo ?? null,
    difficulty: trip.difficulty ?? null,
    isPaused: !!trip.isPaused,
    pausedAt: trip.pausedAt ?? null,
  }
}

// What the trip's header and its actions need, loaded once for every tab. A failed fetch
// falls back to the trip-list cache rather than an error: the header sits above every tab,
// and an error here would strand each cache those tabs already have.
export function useTripHeader(tripId: string) {
  const live = useLiveCache<TripHeaderView | null>({
    fetchLive: async () => toHeaderView(await getTrip(tripId)),
    loadCache: async () => {
      const cached = await loadTripListCache()
      const row = cached.find((entry) => entry.id === tripId)
      return row ? { ...row, difficulty: null, isPaused: false, pausedAt: null } : null
    },
    // Deliberately a no-op: saveTripListCache replaces the whole table, so writing this
    // one trip back would destroy every other trip's cached row.
    saveCache: async () => undefined,
    isCacheEmpty: (cached) => cached === null,
    // The trip-list cache's key, because that is the cache this reads: the age shown is the
    // age of the row it actually rendered.
    cacheKey: CACHE_KEY.tripList,
  })
  const { reload } = live

  useEffect(() => {
    void reload()
  }, [reload])

  useTripChanges(tripId, () => void reload(), { tables: ["trip", "trip_member"] })

  // Leader-only trip changes (M9d), known offline from the synced crew rows.
  const [isLeader, setIsLeader] = useState(false)
  useEffect(() => {
    let cancelled = false
    void isTripLeader(tripId)
      .then((leader) => {
        if (!cancelled) setIsLeader(leader)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tripId])

  return { ...live, trip: live.data, isLeader }
}
