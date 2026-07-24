"use client"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { useFullBleedContent } from "@/hooks/use-full-bleed-content"
import { usePositionWatch } from "@/hooks/use-position-watch"
import { useLivePositions } from "@/hooks/use-live-positions"
import { CloseDayButton } from "./close-day-button"
import { MapTopBar } from "./map-top-bar"
import type { MapCoreProps } from "./map-core"
import { PointListPane } from "./point-list-pane"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
import { totalDistanceNm, DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import type { TripState } from "@/lib/dtos/trip"
import { createPoint, updatePoint, updateItinerary } from "@/lib/itinerary/actions"
import { getStreamTicket } from "@/lib/live/actions"
import { setUnitPreference } from "@/lib/profile/actions"
import { debounce } from "@/lib/utils/debounce"
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
  tripDateFrom?: string | null
  tripDateTo?: string | null
  tripState?: TripState | null
  isLeader?: boolean
  // Any trip member may enter Navigate mode while the trip is happening — a
  // separate axis from isLeader, which only gates the View/Edit route-editing
  // toggle. Computed server-side (deriveMembership + tripState === "happening").
  showNavigate?: boolean
  initialDistanceUnit?: DistanceUnit
}

export function MapBuilder({
  itinerary,
  tripId,
  tripName,
  tripDateFrom = null,
  tripDateTo = null,
  tripState = null,
  isLeader = true,
  showNavigate = false,
  initialDistanceUnit = DISTANCE_UNIT.NM,
}: MapBuilderProps) {
  useCollapseSidebar()
  useFullBleedContent()

  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(initialDistanceUnit)
  const [avgSpeedKnots, setAvgSpeedKnots] = useState(itinerary.avgSpeedKnots ?? 2.5)
  const [draftSlices, setDraftSlices] = useState<DaySlice[] | null>(null)
  const [viewMode, setViewMode] = useState(true)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedHour, setSelectedHour] = useState(12)
  const [conditionsVersion, setConditionsVersion] = useState(0)
  const [navigateMode, setNavigateMode] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const bumpConditions = useCallback(() => setConditionsVersion((v) => v + 1), [])

  // ── Navigate mode (M8) ──────────────────────────────────────────────────

  const searchParams = useSearchParams()
  useEffect(() => {
    if (showNavigate && searchParams.get("navigate") === "1") {
      setNavigateMode(true)
      setViewMode(true)
    }
    // Deliberately mount-only (honors the deep link once) — re-running on every
    // searchParams change would fight a user who explicitly turns Navigate off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNavigate])

  const handleToggleNavigate = useCallback(() => {
    setNavigateMode((prev) => {
      const next = !prev
      if (next) setViewMode(true)
      return next
    })
  }, [])

  const mintStreamUrl = useCallback(
    () => (tripId ? getStreamTicket(tripId) : Promise.resolve(null)),
    [tripId],
  )

  useEffect(() => {
    if (!navigateMode || !tripId) {
      setStreamUrl(null)
      return
    }
    let cancelled = false
    mintStreamUrl().then((url) => {
      if (!cancelled) setStreamUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [navigateMode, tripId, mintStreamUrl])

  const positionWatch = usePositionWatch(tripId ?? "", navigateMode)
  const liveStream = useLivePositions(navigateMode ? streamUrl : null, {
    mintUrl: mintStreamUrl,
  })

  const navigateStatusLabel =
    positionWatch.status === "denied"
      ? "Location denied"
      : positionWatch.status === "unsupported"
        ? "Location unavailable"
        : positionWatch.status === "sending"
          ? `Sharing position · ${liveStream.positions.length} crew live`
          : "Acquiring location…"

  // Persist the cruising speed only after the user stops dragging the slider.
  const debouncedSaveSpeed = useMemo(
    () =>
      debounce((speedKnots: number) => {
        updateItinerary(itinerary.id ?? "", { avgSpeedKnots: speedKnots })
      }, 800),
    [itinerary.id],
  )
  useEffect(() => debouncedSaveSpeed.cancel, [debouncedSaveSpeed])

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
    setSelectedPointId(null)

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

  const handleMarkerClick = useCallback(
    (pointId: string) => {
      if (viewMode) {
        const point = state.points.find((p) => p.id === pointId)
        setSelectedPointId(pointId)
        setSelectedDayId(point?.dayId ?? null)
        return
      }
      setSelectedPointId((prev) => (prev === pointId ? null : pointId))
    },
    [viewMode, state.points],
  )

  const handleDistanceUnitChange = useCallback((unit: DistanceUnit) => {
    setDistanceUnit(unit)
    setUnitPreference(unit)
  }, [])

  const handleAvgSpeedChange = useCallback(
    (v: number) => {
      setAvgSpeedKnots(v)
      debouncedSaveSpeed(v)
    },
    [debouncedSaveSpeed],
  )

  const flyToPoint = useMemo(() => {
    if (!selectedPointId) return null
    const p = state.points.find((pt) => pt.id === selectedPointId)
    if (!p || p.latitude == null || p.longitude == null) return null
    return { id: selectedPointId, lat: p.latitude, lng: p.longitude }
  }, [selectedPointId, state.points])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((v) => {
      const next = !v
      // Edit and Navigate are mutually exclusive — Navigate is a View-only sub-state
      // (handleToggleNavigate already forces viewMode true on entry), so leaving View
      // for Edit must also leave Navigate, or the two ended up simultaneously true.
      if (!next) setNavigateMode(false)
      return next
    })
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
      tripDateFrom,
      tripDateTo,
      itineraryId: itinerary.id ?? "",
      distanceUnit,
      setDistanceUnit: handleDistanceUnitChange,
      avgSpeedKnots,
      setAvgSpeedKnots,
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
      tripDateFrom,
      tripDateTo,
      itinerary.id,
      distanceUnit,
      handleDistanceUnitChange,
      avgSpeedKnots,
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
      <div className="bg-background absolute inset-0 z-50">
        <MapTopBar
          tripId={tripId}
          tripName={tripName}
          distanceUnit={distanceUnit}
          onDistanceUnitChange={handleDistanceUnitChange}
          totalDistance={totalDistance}
          dayCount={state.days.length}
          isSaving={isSaving}
          avgSpeedKnots={avgSpeedKnots}
          onAvgSpeedKnotsChange={handleAvgSpeedChange}
          viewMode={viewMode}
          onToggleViewMode={handleToggleViewMode}
          isLeader={isLeader}
          tripState={tripState}
          showNavigate={showNavigate}
          navigateMode={navigateMode}
          onToggleNavigate={handleToggleNavigate}
        />
        {/* Panels are layout siblings of the map, not overlays — they push the map
            narrower instead of covering it, so no information is hidden. */}
        <div className="absolute top-[100px] right-0 bottom-0 left-0 flex md:top-12">
          {viewMode && <DayRail />}
          <div className="relative min-w-0 flex-1">
            {navigateMode && (
              <div className="absolute top-3 left-3 z-[1001] flex items-center gap-2">
                <div className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold shadow">
                  {navigateStatusLabel}
                </div>
                {isLeader && tripId && <CloseDayButton tripId={tripId} />}
              </div>
            )}
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
              livePositions={navigateMode ? liveStream.positions : []}
            />
            {viewMode && <PointDetailSheet />}
          </div>
          {viewMode ? <FeatureDrawer /> : <PointListPane />}
        </div>
      </div>
    </MapBuilderContext.Provider>
  )
}
