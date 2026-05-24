"use client"
import { useCallback, useMemo, useReducer, useState } from "react"
import dynamic from "next/dynamic"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { MapTopBar } from "./map-top-bar"
import type { MapMode } from "./map-top-bar"
import type { MapCoreProps } from "./map-core"
import { PointDropPanel } from "./point-drop-panel"
import { DaySidebar } from "./day-sidebar"
import { DropSidebar } from "./drop-sidebar"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Point, PointType } from "@/lib/dtos/point"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
import { SlidePhase } from "@/lib/types/ui"
import { totalDistanceNm } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import {
  createPoint,
  updatePoint,
  deletePoint,
  createDay,
  updateDay,
  deleteDay,
  assignPointsToDay,
  fetchPois,
} from "@/lib/itinerary/actions"

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
  const [activePointId, setActivePointId] = useState<string | null>(null)
  const [poiResults, setPoiResults] = useState<Point[]>([])

  const day0 = itinerary.days?.find((d) => d.dayNumber === 0)
  const day0Id = day0?.id
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
      p.latitude != null && p.longitude != null
  )
  const totalDistance = totalDistanceNm(validForDistance)

  const pendingPoint = state.pendingPointId
    ? state.points.find((p) => p.id === state.pendingPointId)
    : undefined

  // All days passed to MapCore: Day 0 (for dayId colour lookups) + numbered days.
  const allDaysForMap = useMemo(
    () => [...(day0 ? [day0] : []), ...state.days],
    [day0, state.days],
  )

  // ── slide preview ────────────────────────────────────────────────────────────

  const slidePreviewIds = useMemo((): Set<string> => {
    const { slideState, pointOrder } = state
    if (!slideState?.firstAssignableId || !slideState.hoveredPointId) return new Set()
    const startIdx = pointOrder.indexOf(slideState.firstAssignableId)
    const endIdx = pointOrder.indexOf(slideState.hoveredPointId)
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return new Set()
    return new Set(pointOrder.slice(startIdx, endIdx + 1))
  }, [state.slideState, state.pointOrder])

  const slideColor = useMemo(() => {
    if (!state.slideState) return undefined
    const activeDay = state.days.find((d) => d.id === state.slideState!.dayId)
    return activeDay ? getDayColor(activeDay.dayNumber) : undefined
  }, [state.slideState, state.days])

  // ── mode switch ──────────────────────────────────────────────────────────────

  const handleModeChange = useCallback(async (newMode: MapMode) => {
    setMode(newMode)
    if (newMode !== "assign") return
    if (!itinerary.id) return

    if (state.days.length === 0) {
      // Day 1 always starts from the first dropped point.
      const firstPointId = state.pointOrder[0] ?? null
      dispatch({ type: "SAVING_START" })
      const result = await createDay(itinerary.id, 1)
      dispatch({ type: "SAVING_END" })
      if (result.success) {
        dispatch({ type: "DAY_ADD", day: result.day })
        dispatch({
          type: "SLIDE_START",
          dayId: result.day.id!,
          phase: SlidePhase.PickEnd,
          boundaryPointId: firstPointId,
          firstAssignableId: firstPointId,
        })
        if (firstPointId && result.day.id) {
          dispatch({ type: "POINT_UPDATE", id: firstPointId, fields: { type: "stop" } })
          dispatch({ type: "SAVING_START" })
          await Promise.all([
            updateDay(result.day.id, { startPointId: firstPointId }),
            updatePoint(firstPointId, { type: "stop" }),
          ])
          dispatch({ type: "SAVING_END" })
          dispatch({ type: "DAY_UPDATE", id: result.day.id, fields: { startPointId: firstPointId } })
        }
      }
    } else {
      // Re-entering assign mode: resume slide on the last unfinished day.
      const lastDay = [...state.days].sort((a, b) => a.dayNumber - b.dayNumber).at(-1)!
      if (!lastDay.endPointId) {
        dispatch({
          type: "SLIDE_START",
          dayId: lastDay.id!,
          phase: SlidePhase.PickEnd,
          boundaryPointId: lastDay.startPointId ?? null,
          firstAssignableId: lastDay.startPointId
            ? (state.pointOrder[state.pointOrder.indexOf(lastDay.startPointId) + 1] ?? null)
            : null,
        })
      }
    }
  }, [itinerary.id, state.days, state.pointOrder])

  // ── drop-mode handlers ───────────────────────────────────────────────────────

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

  const handleMarkerDragMove = useCallback((_pointId: string, _lat: number, _lng: number) => {
    /* intentional — MapCore handles live label updates locally */
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

  const handleOk = () => dispatch({ type: "SET_PENDING", id: null })

  const handleRemoveLastWaypoint = async () => {
    const lastDay0Id = [...state.pointOrder]
      .reverse()
      .find((id) => state.points.find((p) => p.id === id)?.dayId === day0Id)
    if (!lastDay0Id) return
    dispatch({ type: "POINT_REMOVE", id: lastDay0Id })
    dispatch({ type: "SAVING_START" })
    await deletePoint(lastDay0Id)
    dispatch({ type: "SAVING_END" })
  }

  // ── assign-mode handlers ─────────────────────────────────────────────────────

  const handleMarkerClick = useCallback(async (pointId: string) => {
    if (mode !== "assign" || !state.slideState) return
    const { dayId, phase, boundaryPointId, firstAssignableId } = state.slideState

    if (phase === SlidePhase.PickStart) {
      // User is repositioning the start of a Day 2+ boundary.
      const activeDay = state.days.find((d) => d.id === dayId)
      const prevDay = activeDay ? state.days.find((d) => d.dayNumber === activeDay.dayNumber - 1) : undefined
      const firstAssignable = state.pointOrder[state.pointOrder.indexOf(pointId) + 1] ?? null
      dispatch({
        type: "SLIDE_START",
        dayId,
        phase: SlidePhase.PickEnd,
        boundaryPointId: pointId,
        firstAssignableId: firstAssignable,
      })
      dispatch({ type: "SAVING_START" })
      await Promise.all([
        updateDay(dayId, { startPointId: pointId }),
        prevDay?.id ? updateDay(prevDay.id, { endPointId: pointId }) : Promise.resolve(),
      ])
      dispatch({ type: "SAVING_END" })
      dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: pointId } })
      if (prevDay?.id) dispatch({ type: "DAY_UPDATE", id: prevDay.id, fields: { endPointId: pointId } })
      return
    }

    // PickEnd: commit the hovered point as the day's end.
    const endPointId = pointId
    const assignStart = firstAssignableId
    if (!assignStart) return

    const startIdx = state.pointOrder.indexOf(assignStart)
    const endIdx = state.pointOrder.indexOf(endPointId)
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return

    const rangeIds = state.pointOrder.slice(startIdx, endIdx + 1)

    dispatch({ type: "POINTS_ASSIGN", dayId, pointIds: rangeIds, day0Id: day0Id!, startPointId: boundaryPointId })
    dispatch({ type: "SLIDE_COMMIT" })
    dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: boundaryPointId, endPointId } })

    // Auto-type the end boundary point as a stop.
    dispatch({ type: "POINT_UPDATE", id: endPointId, fields: { type: "stop" } })

    dispatch({ type: "SAVING_START" })
    await Promise.all([
      assignPointsToDay(dayId, assignStart, endPointId),
      updateDay(dayId, { startPointId: boundaryPointId, endPointId }),
      updatePoint(endPointId, { type: "stop" }),
    ])
    dispatch({ type: "SAVING_END" })
  }, [mode, state.slideState, state.pointOrder, state.days, day0Id])

  const handleMarkerHover = useCallback((pointId: string) => {
    if (!state.slideState) return
    const { phase, boundaryPointId } = state.slideState
    if (phase === SlidePhase.PickStart || boundaryPointId != null) {
      dispatch({ type: "SLIDE_HOVER", hoveredPointId: pointId })
    }
  }, [state.slideState])

  // ── day sidebar handlers ──────────────────────────────────────────────────────

  // Reassign end: re-enter pick_end from the current start boundary.
  const handleEditDay = useCallback((dayId: string) => {
    const day = state.days.find((d) => d.id === dayId)
    if (!day?.startPointId) return
    const boundaryIdx = state.pointOrder.indexOf(day.startPointId)
    const firstAssignable = state.pointOrder[boundaryIdx + 1] ?? null
    dispatch({
      type: "SLIDE_START",
      dayId,
      phase: SlidePhase.PickEnd,
      boundaryPointId: day.startPointId,
      firstAssignableId: firstAssignable,
    })
  }, [state.days, state.pointOrder])

  // Edit start: enter pick_start so the user can reposition the Day N / Day N-1 boundary.
  const handleEditDayStart = useCallback((dayId: string) => {
    dispatch({
      type: "SLIDE_START",
      dayId,
      phase: SlidePhase.PickStart,
      boundaryPointId: null,
      firstAssignableId: null,
    })
  }, [])

  const handleSaveSlide = useCallback(async (dayId: string) => {
    if (!state.slideState || !day0Id) return
    const { phase, boundaryPointId, hoveredPointId, firstAssignableId } = state.slideState
    const activeDay = state.days.find((d) => d.id === dayId)
    if (!activeDay) return

    const finalStart = phase === SlidePhase.PickStart ? boundaryPointId : boundaryPointId
    const finalEnd = hoveredPointId ?? activeDay.endPointId ?? null

    if (!finalStart) {
      // Nothing picked yet — just exit.
      dispatch({ type: "SLIDE_COMMIT" })
      return
    }

    const effectiveFirstAssignable = phase === SlidePhase.PickStart
      ? (state.pointOrder[state.pointOrder.indexOf(finalStart) + 1] ?? finalStart)
      : (firstAssignableId ?? finalStart)

    const startIdx = state.pointOrder.indexOf(effectiveFirstAssignable)
    const endIdx = finalEnd ? state.pointOrder.indexOf(finalEnd) : -1
    if (startIdx !== -1 && endIdx >= startIdx) {
      const rangeIds = state.pointOrder.slice(startIdx, endIdx + 1)
      dispatch({ type: "POINTS_ASSIGN", dayId, pointIds: rangeIds, day0Id, startPointId: finalStart })
      dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: finalStart, endPointId: finalEnd } })
      dispatch({ type: "POINT_UPDATE", id: finalEnd!, fields: { type: "stop" } })
      dispatch({ type: "SAVING_START" })
      await Promise.all([
        assignPointsToDay(dayId, effectiveFirstAssignable, finalEnd!),
        updateDay(dayId, { startPointId: finalStart, endPointId: finalEnd }),
        updatePoint(finalEnd!, { type: "stop" }),
      ])
      dispatch({ type: "SAVING_END" })
    } else if (finalStart) {
      // Only start changed (no end picked yet) — persist start only.
      dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: finalStart } })
      dispatch({ type: "SAVING_START" })
      await updateDay(dayId, { startPointId: finalStart })
      dispatch({ type: "SAVING_END" })
    }
    dispatch({ type: "SLIDE_COMMIT" })
  }, [state.slideState, state.days, state.pointOrder, day0Id])

  const handleCancelSlide = useCallback((dayId: string) => {
    const day = state.days.find((d) => d.id === dayId)
    dispatch({
      type: "SLIDE_CANCEL",
      restore: day?.startPointId && day0Id
        ? { dayId, startPointId: day.startPointId, endPointId: day.endPointId ?? null, day0Id }
        : undefined,
    })
  }, [state.days, day0Id])

  const handleDeleteDay = useCallback(async (dayId: string) => {
    if (!day0Id) return
    const removed = state.days.find((d) => d.id === dayId)
    if (!removed) return
    dispatch({ type: "DAY_REMOVE", id: dayId, day0Id })
    dispatch({ type: "SAVING_START" })
    await deleteDay(dayId)
    // Renumber remaining days on the backend to keep DB in sync
    const remaining = state.days
      .filter((d) => d.id !== dayId)
      .sort((a, b) => a.dayNumber - b.dayNumber)
    await Promise.all(
      remaining
        .filter((d) => d.dayNumber > removed.dayNumber)
        .map((d) => updateDay(d.id!, { dayNumber: d.dayNumber - 1 } as Parameters<typeof updateDay>[1]))
    )
    dispatch({ type: "SAVING_END" })
  }, [day0Id, state.days])

  const handleDateChange = useCallback(async (dayId: string, date: string) => {
    dispatch({ type: "DAY_UPDATE", id: dayId, fields: { date } })
    dispatch({ type: "SAVING_START" })
    await updateDay(dayId, { date })
    dispatch({ type: "SAVING_END" })
  }, [])

  const handleAddDay = useCallback(async () => {
    if (!itinerary.id) return
    const nextDayNumber = state.days.length + 1
    dispatch({ type: "SAVING_START" })
    const result = await createDay(itinerary.id, nextDayNumber)
    dispatch({ type: "SAVING_END" })
    if (!result.success) return
    dispatch({ type: "DAY_ADD", day: result.day })
    // Find the last endpoint across all assigned days to pre-fill the boundary.
    const lastDay = [...state.days].sort((a, b) => a.dayNumber - b.dayNumber).at(-1)
    const boundaryPointId = lastDay?.endPointId ?? null
    const firstAssignableId = boundaryPointId
      ? (state.pointOrder[state.pointOrder.indexOf(boundaryPointId) + 1] ?? null)
      : null
    dispatch({
      type: "SLIDE_START",
      dayId: result.day.id!,
      phase: SlidePhase.PickEnd,
      boundaryPointId,
      firstAssignableId,
    })
    if (boundaryPointId) {
      dispatch({ type: "SAVING_START" })
      await updateDay(result.day.id!, { startPointId: boundaryPointId })
      dispatch({ type: "SAVING_END" })
      dispatch({ type: "DAY_UPDATE", id: result.day.id!, fields: { startPointId: boundaryPointId } })
    }
  }, [itinerary.id, state.days, state.pointOrder])

  // ── drop-mode sidebar handlers ───────────────────────────────────────────────

  const handleDropModeMarkerClick = useCallback((pointId: string) => {
    setActivePointId((prev) => (prev === pointId ? null : pointId))
  }, [])

  const handlePointChange = useCallback(async (pointId: string, fields: Partial<Point>) => {
    dispatch({ type: "POINT_UPDATE", id: pointId, fields })
    dispatch({ type: "SAVING_START" })
    await updatePoint(pointId, fields as Parameters<typeof updatePoint>[1])
    dispatch({ type: "SAVING_END" })
  }, [])

  const handlePointDeleteFromSidebar = useCallback(async (pointId: string) => {
    setActivePointId((prev) => (prev === pointId ? null : prev))
    dispatch({ type: "POINT_REMOVE", id: pointId })
    dispatch({ type: "SAVING_START" })
    await deletePoint(pointId)
    dispatch({ type: "SAVING_END" })
  }, [])

  const handleFetchPois = useCallback(async (point: Point) => {
    if (!point.latitude || !point.longitude) return
    const results = await fetchPois(point.latitude, point.longitude, 5)
    setPoiResults(results)
  }, [])

  const handlePoiSelect = useCallback(async (pointId: string, name: string) => {
    dispatch({ type: "POINT_UPDATE", id: pointId, fields: { name } })
    dispatch({ type: "SAVING_START" })
    await updatePoint(pointId, { name })
    dispatch({ type: "SAVING_END" })
    setPoiResults([])
  }, [])

  const hasDay0Points = state.points.some((p) => p.dayId === day0Id)

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <MapTopBar
        tripId={tripId}
        tripName={tripName}
        mode={mode}
        onModeChange={handleModeChange}
        distanceUnit={distanceUnit}
        onDistanceUnitChange={setDistanceUnit}
        totalDistance={totalDistance}
        dayCount={state.days.length}
        isSaving={isSaving}
        onRemoveLastWaypoint={hasDay0Points && mode === "drop" ? handleRemoveLastWaypoint : undefined}
      />
      <div className="absolute inset-0 top-12">
        <MapCore
          points={orderedPoints}
          days={allDaysForMap}
          mode={mode}
          distanceUnit={distanceUnit}
          slidePreviewIds={slidePreviewIds}
          slideColor={slideColor}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMarkerDragMove={handleMarkerDragMove}
          onMarkerClick={mode === "assign" ? handleMarkerClick : handleDropModeMarkerClick}
          onMarkerHover={mode === "assign" ? handleMarkerHover : undefined}
        />
        {mode === "drop" && (
          <DropSidebar
            points={state.points}
            pointOrder={state.pointOrder}
            activePointId={activePointId}
            onActivePointChange={setActivePointId}
            onPointChange={handlePointChange}
            onPointDelete={handlePointDeleteFromSidebar}
            onFetchPois={handleFetchPois}
            poiResults={poiResults}
            onPoiSelect={handlePoiSelect}
          />
        )}
        {mode === "assign" && (
          <DaySidebar
            days={state.days}
            points={state.points}
            pointOrder={state.pointOrder}
            slideState={state.slideState}
            distanceUnit={distanceUnit}
            activePointId={activePointId}
            onActivePointChange={setActivePointId}
            onPointChange={handlePointChange}
            onEditDay={handleEditDay}
            onEditDayStart={handleEditDayStart}
            onDeleteDay={handleDeleteDay}
            onDateChange={handleDateChange}
            onAddDay={handleAddDay}
            onSaveSlide={handleSaveSlide}
            onCancelSlide={handleCancelSlide}
          />
        )}
        {pendingPoint && mode === "drop" && (
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
