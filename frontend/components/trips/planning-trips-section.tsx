"use client"

import { useState } from "react"
import { TripCard } from "@/components/common/trip-card"
import type { Trip } from "@/lib/dtos/trip"

// UI-only display order — no backend `sort` param for trips (see the M12 §K
// light-touch decision: the full set is already fetched, so this never re-fetches).
// Enum-backed per the project convention — never compare against a raw literal.
export const PLANNING_SORT = {
  SOONEST: "soonest",
  LATEST: "latest",
} as const
type PlanningSort = (typeof PLANNING_SORT)[keyof typeof PLANNING_SORT]

interface PlanningTripsSectionProps {
  trips: Trip[]
}

// The full set is already in memory (the trips list fetches every page up front —
// see lib/api/paginate.ts), so this is a pure client-side re-sort, not a new fetch.
// Undated trips sort last regardless of direction.
export function PlanningTripsSection({ trips }: PlanningTripsSectionProps) {
  const [sort, setSort] = useState<PlanningSort>(PLANNING_SORT.SOONEST)

  const sorted = [...trips].sort((a, b) => {
    if (!a.dateFrom && !b.dateFrom) return 0
    if (!a.dateFrom) return 1
    if (!b.dateFrom) return -1
    return sort === PLANNING_SORT.SOONEST
      ? a.dateFrom.localeCompare(b.dateFrom)
      : b.dateFrom.localeCompare(a.dateFrom)
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as PlanningSort)}
          aria-label="Sort trips"
          className="border-border bg-background rounded-md border px-2 py-1 text-xs"
        >
          <option value={PLANNING_SORT.SOONEST}>Soonest first</option>
          <option value={PLANNING_SORT.LATEST}>Latest first</option>
        </select>
      </div>
      <div className="flex flex-col gap-3">
        {sorted.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </div>
  )
}
