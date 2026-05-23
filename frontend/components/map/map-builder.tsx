"use client"
import { useCallback, useReducer, useState } from "react"
import dynamic from "next/dynamic"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { MapTopBar } from "./map-top-bar"
import type { MapMode } from "./map-top-bar"
import type { MapCoreProps } from "./map-core"
import { PointDropPanel } from "./point-drop-panel"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { PointType } from "@/lib/dtos/point"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
import { totalDistanceNm } from "@/lib/itinerary/distance"
import { createPoint, updatePoint, deletePoint } from "@/lib/itinerary/actions"

const MapCore = dynamic(() => import("./map-core"), { ssr: false }) as React.ComponentType<MapCoreProps>

type MapBuilderProps = {
  itinerary: Itinerary
  tripId: string
  tripName: string
}

export function MapBuilder({ itinerary, tripId, tripName }: MapBuilderProps) {
  useCollapseSidebar()

  const [mode, setMode] = useState<MapMode>("drop")
  const [distanceUnit, setDistanceUnit] = useState<"nm" | "km">("nm")

  const day0 = itinerary.days?.find((d) => d.dayNumber === 0)
  const day0Id = day0?.id
  const allPoints = itinerary.days?.flatMap((d) => d.points ?? []) ?? []

  const [state, dispatch] = useReducer(mapReducer, allPoints, initialMapState)

  const dayCount = itinerary.days?.filter((d) => d.dayNumber > 0).length ?? 0
  const isSaving = state.savingCount > 0

  // Resolve ordered points from pointOrder — independent of `next` links.
  const orderedPoints = state.pointOrder
    .map((id) => state.points.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  const validForDistance = orderedPoints.filter(
    (p): p is typeof p & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null
  )
  const totalDistance = totalDistanceNm(validForDistance)

  const pendingPoint = state.pendingPointId
    ? state.points.find((p) => p.id === state.pendingPointId)
    : undefined

  // ── handlers ────────────────────────────────────────────────────────────────

  const handleMapClick = async (lat: number, lng: number) => {
    if (!day0Id) return
    const tempId = `tmp-${Date.now()}`

    dispatch({ type: "POINT_ADD", point: { id: tempId, type: "position", latitude: lat, longitude: lng, dayId: day0Id } })
    dispatch({ type: "SET_PENDING", id: tempId })
    dispatch({ type: "SAVING_START" })

    const result = await createPoint(day0Id, { type: "position", latitude: lat, longitude: lng })
    dispatch({ type: "SAVING_END" })

    if (result.success) {
      dispatch({ type: "POINT_CONFIRM", tempId, point: { ...result.point, dayId: day0Id } })
    } else {
      dispatch({ type: "POINT_ROLLBACK", id: tempId })
    }
  }

  const handleMarkerDragEnd = useCallback(async (pointId: string, lat: number, lng: number) => {
    dispatch({ type: "POINT_UPDATE", id: pointId, fields: { latitude: lat, longitude: lng } })
    dispatch({ type: "SAVING_START" })
    await updatePoint(pointId, { latitude: lat, longitude: lng })
    dispatch({ type: "SAVING_END" })
  }, [])

  // onMarkerDragMove is a no-op in MapBuilder — MapCore handles it locally for live label updates.
  const handleMarkerDragMove = useCallback((_pointId: string, _lat: number, _lng: number) => {
    /* intentional */
  }, [])

  const handleTypeChange = async (type: PointType) => {
    if (!state.pendingPointId) return
    dispatch({ type: "POINT_UPDATE", id: state.pendingPointId, fields: { type } })
    dispatch({ type: "SAVING_START" })
    await updatePoint(state.pendingPointId, { type })
    dispatch({ type: "SAVING_END" })
  }

  const handleUndo = async () => {
    if (!state.pendingPointId) return
    const id = state.pendingPointId
    dispatch({ type: "POINT_REMOVE", id })
    dispatch({ type: "SAVING_START" })
    await deletePoint(id)
    dispatch({ type: "SAVING_END" })
  }

  const handleOk = () => {
    dispatch({ type: "SET_PENDING", id: null })
  }

  const handleRemoveLastWaypoint = async () => {
    // Use pointOrder (not findTail) so this works regardless of `next` link state.
    const lastDay0Id = [...state.pointOrder]
      .reverse()
      .find((id) => state.points.find((p) => p.id === id)?.dayId === day0Id)
    if (!lastDay0Id) return
    dispatch({ type: "POINT_REMOVE", id: lastDay0Id })
    dispatch({ type: "SAVING_START" })
    await deletePoint(lastDay0Id)
    dispatch({ type: "SAVING_END" })
  }

  const hasDay0Points = state.points.some((p) => p.dayId === day0Id)

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <MapTopBar
        tripId={tripId}
        tripName={tripName}
        mode={mode}
        onModeChange={setMode}
        distanceUnit={distanceUnit}
        onDistanceUnitChange={setDistanceUnit}
        totalDistance={totalDistance}
        dayCount={dayCount}
        isSaving={isSaving}
        onRemoveLastWaypoint={hasDay0Points ? handleRemoveLastWaypoint : undefined}
      />
      <div className="absolute inset-0 top-12">
        <MapCore
          points={orderedPoints}
          days={itinerary.days ?? []}
          mode={mode}
          distanceUnit={distanceUnit}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMarkerDragMove={handleMarkerDragMove}
        />
        {pendingPoint && (
          <PointDropPanel
            selectedType={pendingPoint.type}
            onTypeChange={handleTypeChange}
            onOk={handleOk}
            onUndo={handleUndo}
          />
        )}
      </div>
    </div>
  )
}
