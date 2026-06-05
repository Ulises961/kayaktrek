"use client"
import { useState, useCallback, Fragment } from "react"
import { PlusIcon, Trash2Icon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { initDaySlices, computeSlicesApplyPayload } from "@/lib/itinerary/boundaries"
import { getDayColor } from "@/lib/itinerary/colors"
import { totalDistanceNm, legLabel } from "@/lib/itinerary/distance"
import { createDay, deleteDay, updatePoint, deletePoint, applyBoundaries } from "@/lib/itinerary/actions"
import { initialMapState } from "@/lib/itinerary/map-reducer"
import { PointRow } from "./point-row"
import { BoundaryDivider } from "./boundary-divider"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import type { PointType } from "@/lib/dtos/point"

// ─── render list ─────────────────────────────────────────────────────────────

type RenderItem =
  | { kind: "point"; id: string; rowIdx: number }
  | { kind: "divider"; slice: DaySlice; sliceIdx: number }

function buildRenderList(pointOrder: string[], slices: DaySlice[] | null): RenderItem[] {
  const items: RenderItem[] = []

  // Index of the next non-last slice whose divider we need to emit.
  let pendingSliceIdx = 0

  for (let rowIdx = 0; rowIdx < pointOrder.length; rowIdx++) {
    items.push({ kind: "point", id: pointOrder[rowIdx], rowIdx })

    // After this row, emit all non-last dividers whose day ends here.
    while (
      slices &&
      pendingSliceIdx < slices.length - 1 &&
      slices[pendingSliceIdx].endIdx === rowIdx
    ) {
      items.push({ kind: "divider", slice: slices[pendingSliceIdx], sliceIdx: pendingSliceIdx })
      pendingSliceIdx++
    }
  }

  // Emit any remaining non-last dividers (days whose endIdx is past all points — empty trailing days).
  if (slices) {
    while (pendingSliceIdx < slices.length - 1) {
      items.push({ kind: "divider", slice: slices[pendingSliceIdx], sliceIdx: pendingSliceIdx })
      pendingSliceIdx++
    }
  }

  return items
}

// ─── component ───────────────────────────────────────────────────────────────

export function PointListPane() {
  const {
    state,
    dispatch,
    draftSlices,
    setDraftSlices,
    distanceUnit,
    avgSpeedKnots,
    itineraryId,
    day0Id,
    activePointId,
    setActivePointId,
  } = useMapBuilder()

  const [dirtyPoints, setDirtyPoints] = useState<Map<string, { type?: PointType; name?: string }>>(new Map())
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768
  )

  const dayNumberById = new Map(state.days.map((d) => [d.id, d.dayNumber]))
  dayNumberById.set(day0Id ?? "", 0)

  const boundaryIds = new Set<string>()
  for (const day of state.days) {
    if (day.startPointId) boundaryIds.add(day.startPointId)
    if (day.endPointId) boundaryIds.add(day.endPointId)
  }

  const renderList = buildRenderList(state.pointOrder, draftSlices)

  function getSliceDistance(slice: DaySlice): number {
    const ownedStart = slice.startIdx  // includes the shared boundary stop
    const ownedEnd = slice.endIdx
    if (ownedStart > ownedEnd) return 0
    const ids = state.pointOrder.slice(ownedStart, ownedEnd + 1)
    const pts = ids
      .map((id) => state.points.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined && p.latitude != null && p.longitude != null) as Array<{ latitude: number; longitude: number }>
    return totalDistanceNm(pts)
  }

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleExpand = useCallback((id: string) => {
    setActivePointId(activePointId === id ? null : id)
  }, [activePointId, setActivePointId])

  const handleTypeChange = useCallback(async (pointId: string, type: PointType) => {
    if (draftSlices) {
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
  }, [draftSlices, dispatch])

  const handleNameChange = useCallback((pointId: string, name: string) => {
    if (draftSlices) {
      setDirtyPoints((prev) => {
        const next = new Map(prev)
        next.set(pointId, { ...next.get(pointId), name })
        return next
      })
      return
    }
    dispatch({ type: "SET_PENDING_NAME", name })
  }, [draftSlices, dispatch])

  const handleDelete = useCallback(async (pointId: string) => {
    setActivePointId(null)
    dispatch({ type: "POINT_REMOVE", id: pointId })
    dispatch({ type: "SAVING_START" })
    await deletePoint(pointId)
    dispatch({ type: "SAVING_END" })
  }, [dispatch, setActivePointId])

  const handleBoundaryMove = useCallback((dayId: string, newEndIdx: number) => {
    if (!draftSlices) return
    const i = draftSlices.findIndex((s) => s.dayId === dayId)
    if (i === -1) return

    const M = state.pointOrder.length
    const minEndIdx = i > 0 ? draftSlices[i - 1].endIdx : 0
    const maxEndIdx = i < draftSlices.length - 1 ? draftSlices[i + 1].endIdx : M - 1
    if (minEndIdx > maxEndIdx) return

    const clamped = Math.max(minEndIdx, Math.min(maxEndIdx, newEndIdx))

    setDraftSlices(draftSlices.map((s, idx) => {
      if (idx === i) return { ...s, endIdx: clamped }
      // The next slice's startIdx is always the shared boundary stop from this slice.
      if (idx === i + 1) return { ...s, startIdx: clamped }
      return s
    }))
  }, [draftSlices, setDraftSlices, state.pointOrder.length])

  const handleEditBoundaries = useCallback(() => {
    const slices = initDaySlices(state.days, state.pointOrder)
    setDraftSlices(slices)
  }, [state.days, state.pointOrder, setDraftSlices])

  const handleAddDay = useCallback(async () => {
    if (!itineraryId) return
    const nextDayNumber = state.days.length + 1
    dispatch({ type: "SAVING_START" })
    const result = await createDay(itineraryId, nextDayNumber)
    dispatch({ type: "SAVING_END" })
    if (!result.success) return
    dispatch({ type: "DAY_ADD", day: result.day })
    setDraftSlices(initDaySlices([...state.days, result.day], state.pointOrder))
  }, [itineraryId, state.days, state.pointOrder, dispatch, setDraftSlices])

  const handleApply = useCallback(async () => {
    if (!draftSlices || !day0Id) return
    const snapshot = state

    const base = computeSlicesApplyPayload(draftSlices, state)
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

    dispatch({ type: "BOUNDARIES_APPLY", slices: draftSlices, pointUpdates, day0Id })
    setDirtyPoints(new Map())
    setDraftSlices(null)

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
  }, [draftSlices, day0Id, state, dirtyPoints, dispatch, setDraftSlices, itineraryId])

  const handleCancel = useCallback(() => {
    setDirtyPoints(new Map())
    setDraftSlices(null)
  }, [setDraftSlices])

  const handleDateChange = useCallback((dayId: string, date: string | null) => {
    if (!draftSlices) return
    setDraftSlices(draftSlices.map((s) => s.dayId === dayId ? { ...s, date } : s))
  }, [draftSlices, setDraftSlices])

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

  if (collapsed) {
    return (
      <div className="absolute right-0 top-0 bottom-0 w-10 z-[1001] bg-background/95 border-l border-border flex flex-col items-center overflow-hidden">
        <div className="flex items-center justify-center px-0 py-2 border-b border-border shrink-0 w-full">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand points panel"
            className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <PanelRightOpenIcon className="size-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <span
            className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest select-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Points
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="point-list-pane"
      className="absolute right-0 top-0 bottom-0 w-56 sm:w-64 z-[1001] bg-background/95 border-l border-border flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse panel"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
        {draftSlices ? (
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
        {/* Static Day 1 header */}
        {draftSlices && draftSlices.length > 0 && (() => {
          const s0 = draftSlices[0]
          return (
            <div
              data-testid="day-1-header"
              className="flex items-center gap-1.5 px-3 py-1 border-b border-border bg-muted/30 text-xs font-medium select-none"
            >
              <span>Day 1</span>
              <span className="text-muted-foreground">·</span>
              <input
                type="date"
                value={s0.date ?? ""}
                placeholder="No date"
                onChange={(e) => handleDateChange(s0.dayId, e.target.value || null)}
                className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer w-[6.5rem]"
              />
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{legLabel(getSliceDistance(s0), avgSpeedKnots, distanceUnit)}</span>
            </div>
          )
        })()}

        {renderList.map((item) => {
          if (item.kind === "point") {
            const { id, rowIdx } = item
            const point = state.points.find((p) => p.id === id)
            if (!point) return null

            const dayNum = dayNumberById.get(point.dayId ?? "") ?? 0
            const dayColor = getDayColor(dayNum)
            const isBoundary = !!point.id && boundaryIds.has(point.id)
            const isExpanded = activePointId === id || state.pendingPointId === id

            const dirtyFields = draftSlices ? dirtyPoints.get(id) : undefined
            const displayPoint = dirtyFields ? { ...point, ...dirtyFields } : point

            return (
              <div key={id} data-point-idx={rowIdx}>
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
            )
          }

          // kind === "divider"
          const { slice, sliceIdx } = item
          const nextSlice = draftSlices![sliceIdx + 1]
          return (
            <Fragment key={`divider-${slice.dayId}`}>
              <BoundaryDivider
                boundary={slice}
                totalDistanceNm={getSliceDistance(nextSlice ?? slice)}
                distanceUnit={distanceUnit}
                avgSpeedKnots={avgSpeedKnots}
                labelDayNumber={slice.dayNumber + 1}
                labelDate={nextSlice?.date ?? null}
                onDateChange={(date) => nextSlice && handleDateChange(nextSlice.dayId, date)}
                onBoundaryMove={(newEndIdx) => handleBoundaryMove(slice.dayId, newEndIdx)}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
