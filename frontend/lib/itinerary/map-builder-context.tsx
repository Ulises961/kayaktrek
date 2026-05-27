"use client"

import { createContext, useContext } from "react"
import type { Dispatch } from "react"
import type { MapState, MapAction } from "./map-reducer"
import type { DraftBoundary } from "./boundaries"

export type { DraftBoundary }

export type MapBuilderContextValue = {
  state: MapState
  dispatch: Dispatch<MapAction>
  draftBoundaries: DraftBoundary[] | null
  setDraftBoundaries: (b: DraftBoundary[] | null) => void
  tripId: string | null
  itineraryId: string
  distanceUnit: "nm" | "km"
  setDistanceUnit: (u: "nm" | "km") => void
  avgSpeedKnots: number
  setAvgSpeedKnots: (v: number) => void
  activePointId: string | null
  setActivePointId: (id: string | null) => void
  day0Id: string | null
}

export const MapBuilderContext = createContext<MapBuilderContextValue | null>(null)

export function useMapBuilder(): MapBuilderContextValue {
  const ctx = useContext(MapBuilderContext)
  if (!ctx) throw new Error("useMapBuilder must be used inside MapBuilder")
  return ctx
}
