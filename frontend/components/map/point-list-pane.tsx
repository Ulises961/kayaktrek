"use client"
import { useState, useCallback, Fragment } from "react"
import { PlusIcon, SlashIcon, Trash2Icon } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { initDraftBoundaries, computeBoundaryApplyPayload } from "@/lib/itinerary/boundaries"
import { getDayColor } from "@/lib/itinerary/colors"
import { totalDistanceNm, legLabel } from "@/lib/itinerary/distance"
import { createDay, deleteDay, updateDay, updatePoint, deletePoint, applyBoundaries } from "@/lib/itinerary/actions"
import { initialMapState } from "@/lib/itinerary/map-reducer"
import { PointRow } from "./point-row"
import { BoundaryDivider } from "./boundary-divider"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"
import type { PointType } from "@/lib/dtos/point"

export function PointListPane() {
  const {
    state,
    dispatch,
    draftBoundaries,
    setDraftBoundaries,
    distanceUnit,
    avgSpeedKnots,
    itineraryId,
    day0Id,
    activePointId,
    setActivePointId,
  } = useMapBuilder()

  const [dirtyPoints, setDirtyPoints] = useState<Map<string, { type?: PointType; name?: string }>>(new Map())

  // Build a map from dayId → dayNumber for color lookups.
  const dayNumberById = new Map(state.days.map((d) => [d.id, d.dayNumber]))
  dayNumberById.set(day0Id ?? "", 0)

  // Build boundary point IDs set (for locking type selector).
  const boundaryIds = new Set<string>()
  for (const day of state.days) {
    if (day.startPointId) boundaryIds.add(day.startPointId)
    if (day.endPointId) boundaryIds.add(day.endPointId)
  }

  // ── draft boundary positions (for divider insertion) ──────────────────────

  // Map from endPointIdx → draft boundary entry.
  // When two boundaries share the same endPointIdx (empty trailing day), the
  // earlier day's boundary must win so its divider is rendered (the last
  // boundary's divider is always suppressed by showDivider anyway).
  const draftByEndIdx = draftBoundaries
    ? new Map(
        [...draftBoundaries]
          .sort((a, b) => b.dayNumber - a.dayNumber)
          .map((b) => [b.endPointIdx, b])
      )
    : null

  // Compute per-day total distance for BoundaryDivider.
  function getDayDistance(boundary: DraftBoundary, idx: number): number {
    if (!draftBoundaries) return 0
    const startIdx = idx === 0 ? 0 : draftBoundaries[idx - 1].endPointIdx + 1
    const endIdx = boundary.endPointIdx
    const dayPointIds = state.pointOrder.slice(startIdx, endIdx + 1)
    const dayPoints = dayPointIds
      .map((id) => state.points.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined && p.latitude != null && p.longitude != null) as Array<{ latitude: number; longitude: number }>
    return totalDistanceNm(dayPoints)
  }

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleExpand = useCallback((id: string) => {
    setActivePointId(activePointId === id ? null : id)
  }, [activePointId, setActivePointId])

  const handleTypeChange = useCallback(async (pointId: string, type: PointType) => {
    if (draftBoundaries) {
      setDirtyPoints((prev) => {
        const next = new Map(prev)
        next.set(pointId, { ...next.get(pointId), type })
        return next
      })
      return
    }
    dispatch({ type: "POINT_UPDATE", id: pointId, fields: { type } })
    dispatch({ type: "SAVING_START" })
    await updatePoint(pointId, { type })
    dispatch({ type: "SAVING_END" })
  }, [draftBoundaries, dispatch])

  const handleNameChange = useCallback((pointId: string, name: string) => {
    if (draftBoundaries) {
      setDirtyPoints((prev) => {
        const next = new Map(prev)
        next.set(pointId, { ...next.get(pointId), name })
        return next
      })
      return
    }
    dispatch({ type: "SET_PENDING_NAME", name })
  }, [draftBoundaries, dispatch])

  const handleDelete = useCallback(async (pointId: string) => {
    setActivePointId(null)
    dispatch({ type: "POINT_REMOVE", id: pointId })
    dispatch({ type: "SAVING_START" })
    await deletePoint(pointId)
    dispatch({ type: "SAVING_END" })
  }, [dispatch, setActivePointId])

  const handleBoundaryMove = useCallback((dayId: string, newEndPointIdx: number) => {
    if (!draftBoundaries) return
    const sorted = [...draftBoundaries].sort((a, b) => a.dayNumber - b.dayNumber)
    const i = sorted.findIndex((b) => b.dayId === dayId)
    if (i === -1) return

    const minIdx = i > 0 ? sorted[i - 1].endPointIdx + 1 : 0
    const maxIdx = i < sorted.length - 1
      ? sorted[i + 1].endPointIdx
      : state.pointOrder.length - 1

    if (minIdx > maxIdx) return
    const clamped = Math.max(minIdx, Math.min(maxIdx, newEndPointIdx))
    setDraftBoundaries(draftBoundaries.map((b) => b.dayId === dayId ? { ...b, endPointIdx: clamped } : b))
  }, [draftBoundaries, setDraftBoundaries, state.pointOrder.length])

  const handleEditBoundaries = useCallback(() => {
    const draft = initDraftBoundaries(state.days, state.pointOrder)
    setDraftBoundaries(draft)
  }, [state.days, state.pointOrder, setDraftBoundaries])

  const handleAddDay = useCallback(async () => {
    if (!itineraryId) return
    const nextDayNumber = state.days.length + 1
    dispatch({ type: "SAVING_START" })
    const result = await createDay(itineraryId, nextDayNumber)
    dispatch({ type: "SAVING_END" })
    if (!result.success) return
    dispatch({ type: "DAY_ADD", day: result.day })
    const draft = initDraftBoundaries([...state.days, result.day], state.pointOrder)
    setDraftBoundaries(draft)
  }, [itineraryId, state.days, state.pointOrder, dispatch, setDraftBoundaries])

  const handleApply = useCallback(async () => {
    if (!draftBoundaries || !day0Id) return
    const snapshot = state

    const base = computeBoundaryApplyPayload(draftBoundaries, state)
    const pointMap = new Map(base.points.map((p) => [p.id, p]))
    for (const [id, fields] of dirtyPoints.entries()) {
      const resolvedType = (fields.type ?? state.points.find((p) => p.id === id)?.type ?? "position") as PointType
      const existing = pointMap.get(id)
      pointMap.set(id, existing
        ? { ...existing, type: resolvedType, ...(fields.name !== undefined ? { name: fields.name } : {}) }
        : { id, type: resolvedType, ...(fields.name !== undefined ? { name: fields.name } : {}) }
      )
    }
    const payload = { boundaries: base.boundaries, points: Array.from(pointMap.values()) }

    const pointUpdates = Array.from(dirtyPoints.entries()).map(([id, fields]) => ({
      id,
      type: (fields.type ?? state.points.find((p) => p.id === id)?.type ?? "position") as PointType,
      ...(fields.name !== undefined ? { name: fields.name } : {}),
    }))

    dispatch({ type: "BOUNDARIES_APPLY", boundaries: draftBoundaries, pointUpdates, day0Id })
    setDirtyPoints(new Map())
    setDraftBoundaries(null)

    dispatch({ type: "SAVING_START" })
    const result = await applyBoundaries(itineraryId, payload)
    dispatch({ type: "SAVING_END" })

    if (result.success) {
      const allPoints = result.itinerary.days?.flatMap((d) => d.points ?? []) ?? []
      const numberedDays = result.itinerary.days?.filter((d) => d.dayNumber > 0) ?? []
      dispatch({ type: "STATE_REPLACE", state: initialMapState(allPoints, numberedDays) })
    } else {
      dispatch({ type: "STATE_REPLACE", state: snapshot })
    }
  }, [draftBoundaries, day0Id, state, dirtyPoints, dispatch, setDraftBoundaries, itineraryId])

  const handleCancel = useCallback(() => {
    setDirtyPoints(new Map())
    setDraftBoundaries(null)
  }, [setDraftBoundaries])

  const handleDateChange = useCallback((dayId: string, date: string | null) => {
    if (!draftBoundaries) return
    setDraftBoundaries(draftBoundaries.map((b) => b.dayId === dayId ? { ...b, date } : b))
  }, [draftBoundaries, setDraftBoundaries])

  const handleDeleteDay = useCallback(async () => {
    if (!state.days.length || !day0Id) return
    const lastDay = state.days.reduce((max, d) => d.dayNumber > max.dayNumber ? d : max, state.days[0])
    if (!lastDay.id) return
    dispatch({ type: "DAY_REMOVE", id: lastDay.id, day0Id })
    dispatch({ type: "SAVING_START" })
    await deleteDay(lastDay.id)
    dispatch({ type: "SAVING_END" })
  }, [state.days, day0Id, dispatch])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute right-0 top-0 bottom-0 w-64 z-[1001] bg-background/95 border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        {draftBoundaries ? (
          <>
            <button
              type="button"
              className="flex-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              onClick={handleApply}
            >
              Apply
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {state.days.length > 0 && (
              <button
                type="button"
                className="flex-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                onClick={handleEditBoundaries}
              >
                Edit boundaries
              </button>
            )}
            <button
              type="button"
              aria-label="Add day"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleAddDay}
            >
              <PlusIcon className="size-3.5" />
              <span>Add day</span>
            </button>
            {state.days.length > 0 && (() => {
              const lastDay = state.days.reduce((max, d) => d.dayNumber > max.dayNumber ? d : max, state.days[0])
              return (
                <button
                  type="button"
                  aria-label={`Delete day ${lastDay.dayNumber}`}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  onClick={handleDeleteDay}
                >
                  <Trash2Icon className="size-3.5" />
                  <span>Day {lastDay.dayNumber}</span>
                </button>
              )
            })()}
          </>
        )}
      </div>

      {/* Point list */}
      <div className="flex-1 overflow-y-auto" data-point-list="true">
        {/* Static Day 1 header — non-draggable, shows date and day 1 distance */}
        {draftBoundaries && draftBoundaries.length > 0 && (() => {
          const b1 = draftBoundaries[0]
          return (
            <div
              data-testid="day-1-header"
              className="flex items-center gap-1.5 px-3 py-1 border-b border-border bg-muted/30 text-xs font-medium select-none"
            >
              <span>Day 1</span>
              <span className="text-muted-foreground">·</span>
              <input
                type="date"
                value={b1.date ?? ""}
                placeholder="No date"
                onChange={(e) => handleDateChange(b1.dayId, e.target.value || null)}
                className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer w-[6.5rem]"
              />
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{legLabel(getDayDistance(b1, 0), avgSpeedKnots, distanceUnit)}</span>
            </div>
          )
        })()}
        {state.pointOrder.map((id, rowIdx) => {
          const point = state.points.find((p) => p.id === id)
          if (!point) return null

          const dayNum = dayNumberById.get(point.dayId ?? "") ?? 0
          const dayColor = getDayColor(dayNum)
          const isBoundary = !!point.id && boundaryIds.has(point.id)
          const isExpanded = activePointId === id || state.pendingPointId === id

          // In boundary-edit mode, apply dirty type/name overrides for visual feedback
          // without touching state.points (dirty changes are staged until Apply).
          const dirtyFields = draftBoundaries ? dirtyPoints.get(id) : undefined
          const displayPoint = dirtyFields ? { ...point, ...dirtyFields } : point

          const divider = draftByEndIdx?.get(rowIdx)
          const dividerIdx = divider ? draftBoundaries!.indexOf(divider) : -1
          // Skip the last boundary — the final day has no following day to label.
          const showDivider = divider && dividerIdx < draftBoundaries!.length - 1
          const labelDate = showDivider
            ? (draftBoundaries![dividerIdx + 1]?.date ?? null)
            : null

          return (
            <Fragment key={id}>
              <div data-point-idx={rowIdx}>
                <PointRow
                  point={displayPoint}
                  index={rowIdx + 1}
                  isExpanded={isExpanded}
                  onExpand={handleExpand}
                  isBoundary={isBoundary}
                  dayColor={dayColor}
                  onTypeChange={(type) => point.id && handleTypeChange(point.id, type)}
                  onNameChange={(name) => point.id && handleNameChange(point.id, name)}
                  onDelete={point.id ? () => handleDelete(point.id!) : undefined}
                />
              </div>
              {showDivider && (
                <BoundaryDivider
                  boundary={divider!}
                  totalDistanceNm={getDayDistance(divider!, dividerIdx)}
                  distanceUnit={distanceUnit}
                  avgSpeedKnots={avgSpeedKnots}
                  labelDayNumber={divider!.dayNumber + 1}
                  labelDate={labelDate}
                  onDateChange={(date) => {
                    const nextBoundary = draftBoundaries![dividerIdx + 1]
                    if (nextBoundary) handleDateChange(nextBoundary.dayId, date)
                  }}
                  onBoundaryMove={(newIdx) => handleBoundaryMove(divider!.dayId, newIdx)}
                />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
