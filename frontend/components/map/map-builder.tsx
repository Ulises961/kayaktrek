"use client"
import { useCallback, useMemo, useReducer, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { MapTopBar } from "./map-top-bar"
import type { MapCoreProps } from "./map-core"
import { PointListPane } from "./point-list-pane"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
import { totalDistanceNm } from "@/lib/itinerary/distance"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import type { TripState } from "@/lib/dtos/trip"
import { createPoint, updatePoint, updateItinerary } from "@/lib/itinerary/actions"
import { DayRail } from "./day-rail"
import { FeatureDrawer } from "./feature-drawer"
import { PointDetailSheet } from "./point-detail-sheet"

const MapCore = dynamic(() => import("./map-core"), {
  ssr: false,
}) as React.ComponentType<MapCoreProps>

type MapBuilderProps = {
  itinerary: Itinerary
  tripId: string | null
  tripName: string
  tripState?: TripState | null
  isLeader?: boolean
}

export function MapBuilder({
  itinerary,
  tripId,
  tripName,
  tripState = null,
  isLeader = true,
}: MapBuilderProps) {
  useCollapseSidebar()

  const [distanceUnit, setDistanceUnit] = useState<"nm" | "km">("nm")
  const [avgSpeedKnots, setAvgSpeedKnots] = useState(itinerary.avgSpeedKnots ?? 2.5)
  const [draftSlices, setDraftSlices] = useState<DaySlice[] | null>(null)
  const [activePointId, setActivePointId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState(true)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedHour, setSelectedHour] = useState(12)
  const [conditionsVersion, setConditionsVersion] = useState(0)

  const bumpConditions = useCallback(() => setConditionsVersion((v) => v + 1), [])

  const speedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const day0 = itinerary.days?.find((d) => d.dayNumber === 0)
  const day0Id = day0?.id ?? null
  const allPoints = itinerary.days?.flatMap((d) => d.points ?? []) ?? []
  const numberedDays = itinerary.days?.filter((d) => d.dayNumber > 0) ?? []

  const [state, dispatch] = useReducer(
    mapReducer,
    { points: allPoints, days: numberedDays },
    ({ points, days }) => initialMapState(points, days),
  )

  const isSaving = state.savingCount > 0

  const orderedPoints = useMemo(
    () =>
      state.pointOrder
        .map((id) => state.points.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined),
    [state.pointOrder, state.points],
  )

  const validForDistance = orderedPoints.filter(
    (p): p is typeof p & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null,
  )
  const totalDistance = totalDistanceNm(validForDistance)

  // All days passed to MapCore: Day 0 (for dayId colour lookups) + numbered days.
  const allDaysForMap = useMemo(() => [...(day0 ? [day0] : []), ...state.days], [day0, state.days])

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleMapClick = async (lat: number, lng: number) => {
    if (!day0Id) return
    const tempId = `tmp-${Date.now()}`

    // Collapse any expanded point row so the newly added point is the only focus.
    setActivePointId(null)

    dispatch({
      type: "POINT_ADD",
      point: { id: tempId, type: "position", latitude: lat, longitude: lng, dayId: day0Id },
    })
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

  const handleMarkerDragMove = useCallback((_pointId: string, _lat: number, _lng: number) => {
    /* intentional — MapCore handles live label updates locally */
  }, [])

  const handleMarkerClick = useCallback((pointId: string) => {
    setActivePointId((prev) => (prev === pointId ? null : pointId))
  }, [])

  const handleAvgSpeedChange = useCallback(
    (v: number) => {
      setAvgSpeedKnots(v)
      if (speedDebounceRef.current) clearTimeout(speedDebounceRef.current)
      speedDebounceRef.current = setTimeout(() => {
        updateItinerary(itinerary.id ?? "", { avgSpeedKnots: v })
      }, 800)
    },
    [itinerary.id],
  )

  const flyToPoint = useMemo(() => {
    if (!selectedPointId) return null
    const p = state.points.find((pt) => pt.id === selectedPointId)
    if (!p || p.latitude == null || p.longitude == null) return null
    return { id: selectedPointId, lat: p.latitude, lng: p.longitude }
  }, [selectedPointId, state.points])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((v) => !v)
    setSelectedDayId(null)
    setSelectedPointId(null)
  }, [])

  const ctxValue = useMemo(
    () => ({
      state,
      dispatch,
      draftSlices,
      setDraftSlices,
      tripId: tripId ?? null,
      tripName,
      itineraryId: itinerary.id ?? "",
      distanceUnit,
      setDistanceUnit,
      avgSpeedKnots,
      setAvgSpeedKnots,
      activePointId,
      setActivePointId,
      day0Id,
      viewMode,
      setViewMode,
      selectedDayId,
      setSelectedDayId,
      selectedPointId,
      setSelectedPointId,
      tripState,
      isLeader,
      selectedHour,
      setSelectedHour,
      conditionsVersion,
      bumpConditions,
    }),
    [
      state,
      dispatch,
      draftSlices,
      tripId,
      tripName,
      itinerary.id,
      distanceUnit,
      avgSpeedKnots,
      activePointId,
      day0Id,
      viewMode,
      selectedDayId,
      selectedPointId,
      tripState,
      isLeader,
      selectedHour,
      conditionsVersion,
      bumpConditions,
    ],
  )

  return (
    <MapBuilderContext.Provider value={ctxValue}>
      <div className="bg-background fixed inset-0 z-50">
        <MapTopBar
          tripId={tripId}
          tripName={tripName}
          distanceUnit={distanceUnit}
          onDistanceUnitChange={setDistanceUnit}
          totalDistance={totalDistance}
          dayCount={state.days.length}
          isSaving={isSaving}
          avgSpeedKnots={avgSpeedKnots}
          onAvgSpeedKnotsChange={handleAvgSpeedChange}
          viewMode={viewMode}
          onToggleViewMode={handleToggleViewMode}
          isLeader={isLeader}
          tripState={tripState}
        />
        {/* Panels are layout siblings of the map, not overlays — they push the map
            narrower instead of covering it, so no information is hidden. */}
        <div className="absolute top-[100px] right-0 bottom-0 left-0 flex md:top-12">
          {viewMode && <DayRail />}
          <div className="relative min-w-0 flex-1">
            <MapCore
              points={orderedPoints}
              days={allDaysForMap}
              distanceUnit={distanceUnit}
              viewMode={viewMode}
              selectedDayId={selectedDayId}
              selectedHour={selectedHour}
              flyToPoint={flyToPoint}
              itineraryId={itinerary.id ?? ""}
              canManageDiamonds
              canManagePlaces
              onMapClick={handleMapClick}
              onMarkerDragEnd={handleMarkerDragEnd}
              onMarkerDragMove={handleMarkerDragMove}
              onMarkerClick={handleMarkerClick}
              avgSpeedKnots={avgSpeedKnots}
            />
            {viewMode && <PointDetailSheet />}
          </div>
          {viewMode ? <FeatureDrawer /> : <PointListPane />}
        </div>
      </div>
    </MapBuilderContext.Provider>
  )
}
