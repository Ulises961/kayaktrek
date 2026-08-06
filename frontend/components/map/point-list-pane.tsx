"use client"
import { useCallback, useMemo, useRef, useState, Fragment } from "react"
import { PlusIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import {
  initDaySlices,
  resolveDraft,
  initDraftBoundaries,
  appendDraftBoundary,
  removeDraftBoundary,
  computeSlicesApplyPayload,
  isDraftDay,
  latestDatedSliceDate,
} from "@/lib/itinerary/boundaries"
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
import { addDaysIso } from "@/lib/utils/date"
import { DatePicker } from "@/components/common/date-picker"
import { useSaveStatus } from "@/hooks/use-save-status"
import { PointRow } from "./point-row"
import { BoundaryDivider } from "./boundary-divider"
import { ExtendTripRangeFooter } from "./extend-trip-range-footer"
import type { DaySlice, DraftBoundary } from "@/lib/itinerary/boundaries"
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

// A day-date picker's popover footer offering to push the trip's own
// dateFrom/dateTo out of the way when that's the bound actually blocking the
// user (never for the previous-day ordering constraint — extending the trip
// wouldn't help there). Either, both, or neither side may apply.
function buildRangeFooter(
  tripId: string | null,
  showMin: boolean,
  minBound: string | undefined,
  showMax: boolean,
  maxBound: string | undefined,
) {
  if (!tripId) return undefined
  const min = showMin && minBound
  const max = showMax && maxBound
  if (!min && !max) return undefined
  return (
    <>
      {min && <ExtendTripRangeFooter tripId={tripId} direction="min" currentBound={minBound!} />}
      {max && <ExtendTripRangeFooter tripId={tripId} direction="max" currentBound={maxBound!} />}
    </>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export function PointListPane() {
  const {
    state,
    dispatch,
    draft,
    setDraft,
    removedRealDayIds,
    setRemovedRealDayIds,
    distanceUnit,
    avgSpeedKnots,
    itineraryId,
    day0Id,
    selectedPointId,
    setSelectedPointId,
    tripId,
    tripDateFrom,
    tripDateTo,
  } = useMapBuilder()

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
  const activeSlices = draft ? resolveDraft(draft, state.pointOrder) : viewSlices
  const dayCount = activeSlices?.length ?? 0

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

  // ── draft materialization ───────────────────────────────────────────────

  // Every boundary gesture routes through this so the first one silently
  // opens the draft — there is no explicit "start editing" step.
  const materializeDraft = useCallback(
    (): DraftBoundary[] => draft ?? initDraftBoundaries(state.days, state.pointOrder),
    [draft, state.days, state.pointOrder],
  )

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleExpand = useCallback(
    (id: string) => {
      setSelectedPointId(selectedPointId === id ? null : id)
    },
    [selectedPointId, setSelectedPointId],
  )

  const handleTypeChange = useCallback(
    async (pointId: string, type: PointType) => {
      dispatch({ type: "SAVING_START" })
      const result = await updatePoint(pointId, { type })
      dispatch({ type: "SAVING_END" })
      if (!result.success) return
      dispatch({ type: "POINT_UPDATE", id: pointId, fields: { type } })
    },
    [dispatch],
  )

  const { status: nameSaveStatus, run: runNameSave } = useSaveStatus()

  const handleNameBlur = useCallback(
    async (pointId: string, name: string) => {
      const trimmed = name.trim()
      const currentName = state.points.find((p) => p.id === pointId)?.name ?? ""
      if (trimmed === currentName) return
      try {
        await runNameSave(async () => {
          dispatch({ type: "SAVING_START" })
          const result = await updatePoint(pointId, { name: trimmed || null })
          dispatch({ type: "SAVING_END" })
          if (!result.success) throw new Error(result.error)
          dispatch({ type: "POINT_UPDATE", id: pointId, fields: { name: trimmed || null } })
        })
      } catch {
        // Status already reverted to idle by runNameSave; the blur handler
        // has nothing further to react to.
      }
    },
    [dispatch, state.points, runNameSave],
  )

  const handleDelete = useCallback(
    async (pointId: string) => {
      // Re-anchor any draft boundary ending on this point to its predecessor, so
      // the day shrinks by one instead of falling back to resolveDraft's
      // anchor-loss clamp, which would collapse it to zero length.
      if (draft) {
        const idx = state.pointOrder.indexOf(pointId)
        const predecessor = idx > 0 ? state.pointOrder[idx - 1] : null
        setDraft(
          draft.map((boundary) =>
            boundary.endPointId === pointId ? { ...boundary, endPointId: predecessor } : boundary,
          ),
        )
      }
      setSelectedPointId(null)
      dispatch({ type: "POINT_REMOVE", id: pointId })
      dispatch({ type: "SAVING_START" })
      await deletePoint(pointId)
      dispatch({ type: "SAVING_END" })
    },
    [draft, setDraft, state.pointOrder, dispatch, setSelectedPointId],
  )

  const handleBoundaryMove = useCallback(
    (dayId: string, newEndIdx: number) => {
      const nextDraft = materializeDraft()
      const resolved = resolveDraft(nextDraft, state.pointOrder)
      const i = resolved.findIndex((s) => s.dayId === dayId)
      if (i === -1) return

      const M = state.pointOrder.length
      const minEndIdx = i > 0 ? resolved[i - 1].endIdx : 0
      const maxEndIdx = i < resolved.length - 1 ? resolved[i + 1].endIdx : M - 1
      if (minEndIdx > maxEndIdx) return

      const clamped = Math.max(minEndIdx, Math.min(maxEndIdx, newEndIdx))
      const anchorId = state.pointOrder[clamped] ?? null

      setDraft(nextDraft.map((b) => (b.dayId === dayId ? { ...b, endPointId: anchorId } : b)))
    },
    [materializeDraft, state.pointOrder, setDraft],
  )

  const handleDateChange = useCallback(
    (dayId: string, date: string | null) => {
      const nextDraft = materializeDraft()
      setDraft(nextDraft.map((b) => (b.dayId === dayId ? { ...b, date } : b)))
    },
    [materializeDraft, setDraft],
  )

  const handleAddDay = useCallback(() => {
    const nextDraft = appendDraftBoundary(materializeDraft(), state.pointOrder)
    setDraft(nextDraft)

    // Scroll the new boundary handle into view after React re-renders — it's
    // the divider for the old last day, immediately above the new handle.
    requestAnimationFrame(() => {
      if (!listRef.current) return
      const resolved = resolveDraft(nextDraft, state.pointOrder)
      if (resolved.length < 2) return
      const dividerIdx = resolved[resolved.length - 2].endIdx
      const target = listRef.current.querySelector<HTMLElement>(`[data-point-idx="${dividerIdx}"]`)
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [materializeDraft, state.pointOrder, setDraft])

  const handleDeleteDay = useCallback(
    (dayId: string) => {
      const nextDraft = materializeDraft()
      setDraft(removeDraftBoundary(nextDraft, dayId))
      if (!isDraftDay(dayId)) {
        setRemovedRealDayIds([...removedRealDayIds, dayId])
      }
    },
    [materializeDraft, setDraft, removedRealDayIds, setRemovedRealDayIds],
  )

  const handleSaveDays = useCallback(async () => {
    if (!draft || !day0Id) return
    const snapshot = state
    const removedIds = removedRealDayIds

    const slices = resolveDraft(draft, state.pointOrder)

    // Resolve any draft-only days into real Day rows, in order, before
    // building the apply-boundaries payload — a day is only ever created
    // once the save is actually going through, never speculatively while
    // still editing (that's what let Discard leave orphaned days before).
    const resolvedSlices: DaySlice[] = []
    const createdDayIds: string[] = []
    for (const slice of slices) {
      if (!isDraftDay(slice.dayId)) {
        resolvedSlices.push(slice)
        continue
      }
      dispatch({ type: "SAVING_START" })
      const result = await createDay(itineraryId, slice.dayNumber)
      dispatch({ type: "SAVING_END" })
      if (!result.success) {
        // Nothing to roll back beyond days created earlier in this same attempt.
        await Promise.all(createdDayIds.map((id) => deleteDay(id)))
        return
      }
      createdDayIds.push(result.day.id!)
      dispatch({ type: "DAY_ADD", day: result.day })
      resolvedSlices.push({ ...slice, dayId: result.day.id! })
    }

    const payload = computeSlicesApplyPayload(resolvedSlices, state)

    dispatch({
      type: "BOUNDARIES_APPLY",
      slices: resolvedSlices,
      pointUpdates: payload.points,
      day0Id,
    })
    setDraft(null)
    setRemovedRealDayIds([])
    setSelectedPointId(null)

    dispatch({ type: "SAVING_START" })
    const result = await applyBoundaries(itineraryId, payload)
    dispatch({ type: "SAVING_END" })

    if (result.success) {
      // Real days deleted only now that the structural save has actually gone
      // through — if the apply had failed, no real day would be destroyed.
      await Promise.all(removedIds.map((id) => deleteDay(id)))
      const allDays = result.itinerary.days ?? []
      const allPoints = allDays.flatMap((d) => d.points ?? [])
      const numberedDays = allDays.filter(
        (d) => d.dayNumber > 0 && !removedIds.includes(d.id ?? ""),
      )
      dispatch({ type: "STATE_REPLACE", state: initialMapState(allPoints, numberedDays) })
    } else {
      await Promise.all(createdDayIds.map((id) => deleteDay(id)))
      dispatch({ type: "STATE_REPLACE", state: snapshot })
    }
  }, [
    draft,
    day0Id,
    state,
    removedRealDayIds,
    dispatch,
    setDraft,
    setRemovedRealDayIds,
    setSelectedPointId,
    itineraryId,
  ])

  const handleDiscard = useCallback(() => {
    setDraft(null)
    setRemovedRealDayIds([])
    setSelectedPointId(null)
  }, [setDraft, setRemovedRealDayIds, setSelectedPointId])

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
        <button
          type="button"
          className="text-primary hover:text-primary/80 disabled:text-muted-foreground flex-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSaveDays}
          disabled={draft === null}
        >
          Save days
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleDiscard}
          disabled={draft === null}
        >
          Discard
        </button>
      </div>

      {/* Point list */}
      <div ref={listRef} className="flex-1 overflow-y-auto" data-point-list="true">
        {/* Day 1 header / bootstrap row — always visible in edit mode */}
        {dayCount === 0 ? (
          <div
            data-testid="day-bootstrap-row"
            className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-1 text-xs font-medium select-none"
          >
            <span className="text-muted-foreground">No days yet</span>
            <button
              type="button"
              aria-label="Add day"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={handleAddDay}
            >
              <PlusIcon className="size-3.5" />
              <span>Add day</span>
            </button>
          </div>
        ) : (
          (() => {
            const s0 = activeSlices![0]
            return (
              <div
                data-testid="day-1-header"
                className="border-border bg-muted/30 flex items-center gap-1.5 border-b px-3 py-1 text-xs font-medium select-none"
              >
                <span>Day 1</span>
                <span className="text-muted-foreground">·</span>
                <DatePicker
                  value={s0.date ?? ""}
                  onChange={(v) => handleDateChange(s0.dayId, v || null)}
                  placeholder="Add date"
                  size="sm"
                  minDate={tripDateFrom ?? undefined}
                  maxDate={tripDateTo ?? undefined}
                  footer={buildRangeFooter(
                    tripId,
                    true,
                    tripDateFrom ?? undefined,
                    true,
                    tripDateTo ?? undefined,
                  )}
                  className="h-6 w-auto border-none bg-transparent px-1 text-xs shadow-none"
                />
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {legLabel(getSliceDistance(s0), avgSpeedKnots, distanceUnit)}
                </span>
                {dayCount === 1 && (
                  <button
                    type="button"
                    aria-label="Add day after day 1"
                    onClick={handleAddDay}
                    className="text-muted-foreground hover:text-foreground ml-auto shrink-0 transition-colors"
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })()
        )}

        {renderList.map((item) => {
          if (item.kind === "point") {
            const { id, rowIdx } = item
            const point = state.points.find((p) => p.id === id)
            if (!point) return null

            const dayNum = dayNumberById.get(point.dayId ?? "") ?? 0
            const dayColor = getDayColor(dayNum)
            const isBoundary = !!point.id && boundaryIds.has(point.id)
            const isExpanded = selectedPointId === id || state.pendingPointId === id

            return (
              <div key={id} data-point-idx={rowIdx}>
                <PointRow
                  point={point}
                  index={rowIdx + 1}
                  isExpanded={isExpanded}
                  onExpand={handleExpand}
                  isBoundary={isBoundary}
                  dayColor={dayColor}
                  onTypeChange={(type) => point.id && handleTypeChange(point.id, type)}
                  onNameBlur={(name) => point.id && handleNameBlur(point.id, name)}
                  saveStatus={isExpanded ? nameSaveStatus : "idle"}
                  onDelete={point.id ? () => handleDelete(point.id!) : undefined}
                />
              </div>
            )
          }

          // kind === "divider"
          const { slice, sliceIdx } = item
          const nextSlice = activeSlices![sliceIdx + 1]
          const priorDate = latestDatedSliceDate(activeSlices!, sliceIdx)
          // A later day can't share the prior dated day's own date, so the
          // floor is the day after it, not the day itself.
          const effectiveMinDate = priorDate
            ? addDaysIso(priorDate, 1)
            : (tripDateFrom ?? undefined)
          const isLastDivider = sliceIdx === activeSlices!.length - 2
          return (
            <Fragment key={`divider-${slice.dayId}`}>
              <BoundaryDivider
                boundary={slice}
                totalDistanceNm={getSliceDistance(nextSlice ?? slice)}
                distanceUnit={distanceUnit}
                avgSpeedKnots={avgSpeedKnots}
                labelDayNumber={slice.dayNumber + 1}
                labelDate={nextSlice?.date ?? null}
                minDate={effectiveMinDate}
                maxDate={tripDateTo ?? undefined}
                footer={buildRangeFooter(
                  tripId,
                  !priorDate,
                  effectiveMinDate,
                  true,
                  tripDateTo ?? undefined,
                )}
                onDateChange={(date) => nextSlice && handleDateChange(nextSlice.dayId, date)}
                onBoundaryMove={(newEndIdx) => handleBoundaryMove(slice.dayId, newEndIdx)}
                onDelete={nextSlice ? () => handleDeleteDay(nextSlice.dayId) : undefined}
                onAddDay={isLastDivider ? handleAddDay : undefined}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
