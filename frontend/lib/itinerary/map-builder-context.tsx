"use client"

import { createContext, useContext } from "react"
import type { Dispatch } from "react"
import type { MapState, MapAction } from "./map-reducer"
import type { DaySlice } from "./boundaries"
import type { TripState } from "@/lib/dtos/trip"
import type { DistanceUnit } from "@/lib/itinerary/distance"

export type { DaySlice }

export type MapBuilderContextValue = {
  state: MapState
  dispatch: Dispatch<MapAction>
  draftSlices: DaySlice[] | null
  setDraftSlices: (s: DaySlice[] | null) => void
  tripId: string | null
  tripName: string
  itineraryId: string
  distanceUnit: DistanceUnit
  setDistanceUnit: (u: DistanceUnit) => void
  avgSpeedKnots: number
  setAvgSpeedKnots: (v: number) => void
  day0Id: string | null
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
