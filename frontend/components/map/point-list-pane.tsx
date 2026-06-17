"use client"
import { useState, useCallback, useMemo, useRef, Fragment } from "react"
import { PlusIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { initDaySlices, computeSlicesApplyPayload } from "@/lib/itinerary/boundaries"
import { getDayColor } from "@/lib/itinerary/colors"
import { totalDistanceNm, legLabel } from "@/lib/itinerary/distance"
import {
  createDay,
  deleteDay,
  updatePoint,
  deletePoint,
  applyBoundaries,
} from "@/lib/itinerary/actions"
import { initialMapState } from "@/lib/itinerary/map-reducer"
import { formatDayDate } from "@/lib/itinerary/format"
import { DatePicker } from "@/components/common/date-picker"
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

  const [dirtyPoints, setDirtyPoints] = useState<Map<string, { type?: PointType; name?: string }>>(
    new Map(),
  )
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  )
  const listRef = useRef<HTMLDivElement>(null)

  const dayNumberById = new Map(state.days.map((d) => [d.id, d.dayNumber]))
  dayNumberById.set(day0Id ?? "", 0)

  const boundaryIds = new Set<string>()
  for (const day of state.days) {
    if (day.startPointId) boundaryIds.add(day.startPointId)
    if (day.endPointId) boundaryIds.add(day.endPointId)
  }

  const viewSlices = useMemo(
    () => (state.days.length > 0 ? initDaySlices(state.days, state.pointOrder) : null),
    [state.days, state.pointOrder],
  )
  const activeSlices = draftSlices ?? viewSlices
  const isInteractive = draftSlices !== null

  const renderList = buildRenderList(state.pointOrder, activeSlices)

  function getSliceDistance(slice: DaySlice): number {
    const ownedStart = slice.startIdx // includes the shared boundary stop
    const ownedEnd = slice.endIdx
    if (ownedStart > ownedEnd) return 0
    const ids = state.pointOrder.slice(ownedStart, ownedEnd + 1)
    const pts = ids
      .map((id) => state.points.find((p) => p.id === id))
      .filter(
        (p): p is NonNullable<typeof p> =>
          p !== undefined && p.latitude != null && p.longitude != null,
      ) as Array<{ latitude: number; longitude: number }>
    return totalDistanceNm(pts)
  }

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleExpand = useCallback(
    (id: string) => {
      setActivePointId(activePointId === id ? null : id)
    },
    [activePointId, setActivePointId],
  )

  const handleTypeChange = useCallback(
    async (pointId: string, type: PointType) => {
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
    },
    [draftSlices, dispatch],
  )

  const handleNameChange = useCallback(
    (pointId: string, name: string) => {
      if (draftSlices) {
        setDirtyPoints((prev) => {
          const next = new Map(prev)
          next.set(pointId, { ...next.get(pointId), name })
          return next
        })
      }
    },
    [draftSlices],
  )

  const handleNameBlur = useCallback(
    async (pointId: string, name: string) => {
      if (draftSlices) return
      const trimmed = name.trim()
      const currentName = state.points.find((p) => p.id === pointId)?.name ?? ""
      if (trimmed === currentName) return
      dispatch({ type: "POINT_UPDATE", id: pointId, fields: { name: trimmed || null } })
      dispatch({ type: "SAVING_START" })
      await updatePoint(pointId, { name: trimmed || null })
      dispatch({ type: "SAVING_END" })
    },
    [draftSlices, dispatch, state.points],
  )

  const handleDelete = useCallback(
    async (pointId: string) => {
      setActivePointId(null)
      dispatch({ type: "POINT_REMOVE", id: pointId })
      dispatch({ type: "SAVING_START" })
      await deletePoint(pointId)
      dispatch({ type: "SAVING_END" })
    },
    [dispatch, setActivePointId],
  )

  const handleBoundaryMove = useCallback(
    (dayId: string, newEndIdx: number) => {
      if (!draftSlices) return
      const i = draftSlices.findIndex((s) => s.dayId === dayId)
      if (i === -1) return

      const M = state.pointOrder.length
      const minEndIdx = i > 0 ? draftSlices[i - 1].endIdx : 0
      const maxEndIdx = i < draftSlices.length - 1 ? draftSlices[i + 1].endIdx : M - 1
      if (minEndIdx > maxEndIdx) return

      const clamped = Math.max(minEndIdx, Math.min(maxEndIdx, newEndIdx))

      setDraftSlices(
        draftSlices.map((s, idx) => {
          if (idx === i) return { ...s, endIdx: clamped }
          // The next slice's startIdx is always the shared boundary stop from this slice.
          if (idx === i + 1) return { ...s, startIdx: clamped }
          return s
        }),
      )
    },
    [draftSlices, setDraftSlices, state.pointOrder.length],
  )

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

    const M = state.pointOrder.length
    let newSlices: DaySlice[]

    if (!activeSlices || activeSlices.length === 0) {
      newSlices = [
        {
          dayId: result.day.id!,
          dayNumber: nextDayNumber,
          startIdx: 0,
          endIdx: M > 0 ? M - 1 : 0,
          date: null,
        },
      ]
    } else {
      const lastSlice = activeSlices[activeSlices.length - 1]
      const midIdx = Math.floor((lastSlice.startIdx + lastSlice.endIdx) / 2)
      newSlices = [
        ...activeSlices.slice(0, -1),
        { ...lastSlice, endIdx: midIdx },
        {
          dayId: result.day.id!,
          dayNumber: nextDayNumber,
          startIdx: midIdx,
          endIdx: lastSlice.endIdx,
          date: null,
        },
      ]
    }

    setDraftSlices(newSlices)

    // Scroll the new boundary handle into view after React re-renders
    requestAnimationFrame(() => {
      if (!listRef.current) return
      const dividerIdx = newSlices.length >= 2 ? newSlices[newSlices.length - 2].endIdx : 0
      const target = listRef.current.querySelector<HTMLElement>(`[data-point-idx="${dividerIdx}"]`)
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [itineraryId, activeSlices, state.days.length, state.pointOrder, dispatch, setDraftSlices])

  const handleApply = useCallback(async () => {
    if (!draftSlices || !day0Id) return
    const snapshot = state

    const base = computeSlicesApplyPayload(draftSlices, state)
    const pointMap = new Map(base.points.map((p) => [p.id, p]))
    for (const [id, fields] of dirtyPoints.entries()) {
      const resolvedType = (fields.type ??
        state.points.find((p) => p.id === id)?.type ??
        "position") as PointType
      const existing = pointMap.get(id)
      pointMap.set(
        id,
        existing
          ? {
              ...existing,
              type: resolvedType,
              ...(fields.name !== undefined ? { name: fields.name } : {}),
            }
          : { id, type: resolvedType, ...(fields.name !== undefined ? { name: fields.name } : {}) },
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
    setActivePointId(null)

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
  }, [
    draftSlices,
    day0Id,
    state,
    dirtyPoints,
    dispatch,
    setDraftSlices,
    setActivePointId,
    itineraryId,
  ])

  const handleCancel = useCallback(() => {
    setDirtyPoints(new Map())
    setDraftSlices(null)
    setActivePointId(null)
  }, [setDraftSlices, setActivePointId])

  const handleDateChange = useCallback(
    (dayId: string, date: string | null) => {
      if (!draftSlices) return
      setDraftSlices(draftSlices.map((s) => (s.dayId === dayId ? { ...s, date } : s)))
    },
    [draftSlices, setDraftSlices],
  )

  const handleDeleteDay = useCallback(
    async (dayId: string) => {
      if (!day0Id) return
      setDraftSlices(null)
      dispatch({ type: "DAY_REMOVE", id: dayId, day0Id })
      dispatch({ type: "SAVING_START" })
      await deleteDay(dayId)
      dispatch({ type: "SAVING_END" })
    },
    [day0Id, dispatch, setDraftSlices],
  )

  // ── render ────────────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="bg-background/95 border-border z-[1001] flex w-10 shrink-0 flex-col items-center overflow-hidden border-l">
        <div className="border-border flex w-full shrink-0 items-center justify-center border-b px-0 py-2">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand points panel"
            className="text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          >
            <PanelRightOpenIcon className="size-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <span
            className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase select-none"
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
      className="bg-background/95 border-border z-[1001] flex w-56 shrink-0 flex-col overflow-hidden border-l sm:w-64"
    >
      {/* Header */}
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse panel"
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
        {draftSlices ? (
          <>
            <button
              type="button"
              className="text-primary hover:text-primary/80 flex-1 text-sm font-medium transition-colors"
              onClick={handleApply}
            >
              Apply
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </>
        ) : state.days.length === 0 ? (
          <button
            type="button"
            aria-label="Add day"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
            onClick={handleAddDay}
          >
            <PlusIcon className="size-3.5" />
            <span>Add day</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex-1 text-left text-xs transition-colors"
              onClick={handleEditBoundaries}
            >
              Edit boundaries
            </button>
            <button
              type="button"
              aria-label="Add day"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
              onClick={handleAddDay}
            >
              <PlusIcon className="size-3.5" />
              <span>Add day</span>
            </button>
          </>
        )}
      </div>

      {/* Point list */}
      <div ref={listRef} className="flex-1 overflow-y-auto" data-point-list="true">
        {/* Static Day 1 header — visible in both view and edit mode */}
        {activeSlices &&
          activeSlices.length > 0 &&
          (() => {
            const s0 = activeSlices[0]
            return (
              <div
                data-testid="day-1-header"
                className="border-border bg-muted/30 flex items-center gap-1.5 border-b px-3 py-1 text-xs font-medium select-none"
              >
                <span>Day 1</span>
                <span className="text-muted-foreground">·</span>
                {isInteractive ? (
                  <DatePicker
                    value={s0.date ?? ""}
                    onChange={(v) => handleDateChange(s0.dayId, v || null)}
                    placeholder="Add date"
                    size="sm"
                    className="h-6 w-auto border-none bg-transparent px-1 text-xs shadow-none"
                  />
                ) : (
                  <span className="text-muted-foreground">{formatDayDate(s0.date)}</span>
                )}
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {legLabel(getSliceDistance(s0), avgSpeedKnots, distanceUnit)}
                </span>
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
                  onNameBlur={(name) => point.id && handleNameBlur(point.id, name)}
                  onDelete={point.id ? () => handleDelete(point.id!) : undefined}
                />
              </div>
            )
          }

          // kind === "divider"
          const { slice, sliceIdx } = item
          const nextSlice = activeSlices![sliceIdx + 1]
          return (
            <Fragment key={`divider-${slice.dayId}`}>
              <BoundaryDivider
                boundary={slice}
                totalDistanceNm={getSliceDistance(nextSlice ?? slice)}
                distanceUnit={distanceUnit}
                avgSpeedKnots={avgSpeedKnots}
                labelDayNumber={slice.dayNumber + 1}
                labelDate={nextSlice?.date ?? null}
                interactive={isInteractive}
                onDateChange={
                  isInteractive
                    ? (date) => nextSlice && handleDateChange(nextSlice.dayId, date)
                    : undefined
                }
                onBoundaryMove={
                  isInteractive
                    ? (newEndIdx) => handleBoundaryMove(slice.dayId, newEndIdx)
                    : undefined
                }
                onDelete={
                  isInteractive && nextSlice ? () => handleDeleteDay(nextSlice.dayId) : undefined
                }
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
