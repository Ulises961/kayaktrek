"use client"

import { createContext, useContext } from "react"
import type { Dispatch } from "react"
import type { MapState, MapAction } from "./map-reducer"
import type { DaySlice, DraftBoundary } from "./boundaries"
import type { TripState } from "@/lib/dtos/trip"
import type { DistanceUnit } from "@/lib/itinerary/distance"

export type { DaySlice, DraftBoundary }

export type MapBuilderContextValue = {
  state: MapState
  dispatch: Dispatch<MapAction>
  draft: DraftBoundary[] | null
  setDraft: (d: DraftBoundary[] | null) => void
  /** Real (non-draft) day ids the user has removed during this draft session —
   * their server-side rows are deleted only at Save. */
  removedRealDayIds: string[]
  setRemovedRealDayIds: (ids: string[]) => void
  tripId: string | null
  tripName: string
  /** ISO date (YYYY-MM-DD) — the trip's own declared start/end, used to bound
   * day-date pickers so a Day can't silently drift outside the trip's range. */
  tripDateFrom: string | null
  tripDateTo: string | null
  itineraryId: string
  distanceUnit: DistanceUnit
  setDistanceUnit: (u: DistanceUnit) => void
  avgSpeedKnots: number
  setAvgSpeedKnots: (v: number) => void
  day0Id: string | null
  /** Day 0's id, provisioning one first if this itinerary somehow has none.
   * Resolves null when the repair fails (the user has been told). Every path that
   * needs the staging area goes through here rather than reading `day0Id` and
   * silently doing nothing when it's absent. */
  resolveDay0Id: () => Promise<string | null>
  viewMode: boolean
  setViewMode: (v: boolean) => void
  selectedDayId: string | null
  setSelectedDayId: (id: string | null) => void
  selectedPointId: string | null
  setSelectedPointId: (id: string | null) => void
  tripState: TripState | null
  isLeader: boolean
  selectedHour: number
  setSelectedHour: (h: number) => void
  /** Bumped after a weather fetch so day-rail entries re-read their conditions. */
  conditionsVersion: number
  bumpConditions: () => void
}

export const MapBuilderContext = createContext<MapBuilderContextValue | null>(null)

export function useMapBuilder(): MapBuilderContextValue {
  const ctx = useContext(MapBuilderContext)
  if (!ctx) throw new Error("useMapBuilder must be used inside MapBuilder")
  return ctx
}
