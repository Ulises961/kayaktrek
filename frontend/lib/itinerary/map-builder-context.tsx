"use client"

import { createContext, useContext } from "react"
import type { Dispatch } from "react"
import type { MapState, MapAction } from "./map-reducer"
import type { DaySlice } from "./boundaries"
import type { TripState } from "@/lib/dtos/trip"

export type { DaySlice }

export type MapBuilderContextValue = {
  state: MapState
  dispatch: Dispatch<MapAction>
  draftSlices: DaySlice[] | null
  setDraftSlices: (s: DaySlice[] | null) => void
  tripId: string | null
  itineraryId: string
  distanceUnit: "nm" | "km"
  setDistanceUnit: (u: "nm" | "km") => void
  avgSpeedKnots: number
  setAvgSpeedKnots: (v: number) => void
  activePointId: string | null
  setActivePointId: (id: string | null) => void
  day0Id: string | null
  viewMode: boolean
  setViewMode: (v: boolean) => void
  selectedDayId: string | null
  setSelectedDayId: (id: string | null) => void
  tripState: TripState | null
  isLeader: boolean
}

export const MapBuilderContext = createContext<MapBuilderContextValue | null>(null)

export function useMapBuilder(): MapBuilderContextValue {
  const ctx = useContext(MapBuilderContext)
  if (!ctx) throw new Error("useMapBuilder must be used inside MapBuilder")
  return ctx
}
