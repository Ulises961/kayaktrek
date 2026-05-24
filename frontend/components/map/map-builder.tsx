"use client"
import { useCallback, useMemo, useReducer, useState } from "react"
import dynamic from "next/dynamic"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { MapTopBar } from "./map-top-bar"
import type { MapMode } from "./map-top-bar"
import type { MapCoreProps } from "./map-core"
import { PointDropPanel } from "./point-drop-panel"
import { DaySidebar } from "./day-sidebar"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { PointType } from "@/lib/dtos/point"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
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
      dispatch({ type: "SAVING_START" })
      const result = await createDay(itinerary.id, 1)
      dispatch({ type: "SAVING_END" })
      if (result.success) {
        dispatch({ type: "DAY_ADD", day: result.day })
        dispatch({
          type: "SLIDE_START",
          dayId: result.day.id!,
          boundaryPointId: null,
          firstAssignableId: null,
        })
      }
    } else {
      // Re-entering assign mode: resume slide on the last unfinished day.
      const lastDay = [...state.days].sort((a, b) => a.dayNumber - b.dayNumber).at(-1)!
      if (!lastDay.endPointId) {
        dispatch({
          type: "SLIDE_START",
          dayId: lastDay.id!,
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
    const { dayId, boundaryPointId, firstAssignableId } = state.slideState

    if (boundaryPointId === null) {
      // Day 1: user picks the start point.
      dispatch({
        type: "SLIDE_START",
        dayId,
        boundaryPointId: pointId,
        firstAssignableId: pointId,
      })
      dispatch({ type: "SAVING_START" })
      await updateDay(dayId, { startPointId: pointId })
      dispatch({ type: "SAVING_END" })
      dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: pointId } })
      return
    }

    // Commit: lock the hovered point as the end.
    const endPointId = pointId
    const assignStart = firstAssignableId
    if (!assignStart) return

    const startIdx = state.pointOrder.indexOf(assignStart)
    const endIdx = state.pointOrder.indexOf(endPointId)
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return

    const rangeIds = state.pointOrder.slice(startIdx, endIdx + 1)

    dispatch({ type: "POINTS_ASSIGN", dayId, pointIds: rangeIds })
    dispatch({ type: "SLIDE_COMMIT" })
    dispatch({ type: "DAY_UPDATE", id: dayId, fields: { startPointId: boundaryPointId, endPointId } })

    dispatch({ type: "SAVING_START" })
    await assignPointsToDay(dayId, assignStart, endPointId)
    dispatch({ type: "SAVING_END" })

    dispatch({ type: "SAVING_START" })
    await updateDay(dayId, { startPointId: boundaryPointId, endPointId })
    dispatch({ type: "SAVING_END" })

    // Auto-start next day if unassigned Day 0 points remain.
    const rangeSet = new Set(rangeIds)
    const hasRemainingDay0 = state.points.some(
      (p) => p.dayId === day0Id && p.id && !rangeSet.has(p.id)
    )
    if (!hasRemainingDay0 || !itinerary.id) return

    const nextDayNumber = state.days.length + 1
    dispatch({ type: "SAVING_START" })
    const newDayResult = await createDay(itinerary.id, nextDayNumber)
    dispatch({ type: "SAVING_END" })

    if (!newDayResult.success) return
    const newDay = newDayResult.day

    dispatch({ type: "DAY_ADD", day: newDay })

    // Update the new day's startPointId to the boundary reference.
    dispatch({ type: "SAVING_START" })
    await updateDay(newDay.id!, { startPointId: endPointId })
    dispatch({ type: "SAVING_END" })
    dispatch({ type: "DAY_UPDATE", id: newDay.id!, fields: { startPointId: endPointId } })

    // Pre-fill slide: boundary = endPointId, firstAssignable = next point after it.
    const boundaryIdx = state.pointOrder.indexOf(endPointId)
    const firstAfterBoundary = state.pointOrder[boundaryIdx + 1] ?? null
    dispatch({
      type: "SLIDE_START",
      dayId: newDay.id!,
      boundaryPointId: endPointId,
      firstAssignableId: firstAfterBoundary,
    })
  }, [mode, state.slideState, state.pointOrder, state.points, state.days, day0Id, itinerary.id])

  const handleMarkerHover = useCallback((pointId: string) => {
    if (state.slideState?.boundaryPointId != null) {
      dispatch({ type: "SLIDE_HOVER", hoveredPointId: pointId })
    }
  }, [state.slideState?.boundaryPointId])

  // ── day sidebar handlers ──────────────────────────────────────────────────────

  const handleEditDay = useCallback((dayId: string) => {
    const day = state.days.find((d) => d.id === dayId)
    if (!day?.startPointId) return
    const boundaryIdx = state.pointOrder.indexOf(day.startPointId)
    const firstAssignable = state.pointOrder[boundaryIdx + 1] ?? null
    dispatch({
      type: "SLIDE_START",
      dayId,
      boundaryPointId: day.startPointId,
      firstAssignableId: firstAssignable,
    })
  }, [state.days, state.pointOrder])

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
          onMarkerClick={mode === "assign" ? handleMarkerClick : undefined}
          onMarkerHover={mode === "assign" ? handleMarkerHover : undefined}
        />
        {mode === "assign" && (
          <DaySidebar
            days={state.days}
            points={state.points}
            pointOrder={state.pointOrder}
            slideState={state.slideState}
            distanceUnit={distanceUnit}
            onEditDay={handleEditDay}
            onDeleteDay={handleDeleteDay}
            onDateChange={handleDateChange}
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
