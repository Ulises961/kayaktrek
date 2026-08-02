"use client"
import { useRef, type ReactNode } from "react"
import { GripVerticalIcon, Trash2Icon, PlusIcon } from "lucide-react"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import { legLabel, type DistanceUnit } from "@/lib/itinerary/distance"
import { formatDayDate } from "@/lib/utils/date"
import { DatePicker } from "@/components/common/date-picker"

export type BoundaryDividerProps = {
  boundary: DaySlice
  totalDistanceNm: number
  distanceUnit: DistanceUnit
  avgSpeedKnots: number
  labelDayNumber: number
  labelDate: string | null
  /** ISO date of the nearest earlier dated day — this day can't be dated before it. */
  minDate?: string
  /** ISO date — this day can't be dated after it (the trip's own dateTo). */
  maxDate?: string
  /** Rendered below the date picker's calendar, inside its popover. */
  footer?: ReactNode
  interactive?: boolean
  onDateChange?: (date: string | null) => void
  onBoundaryMove?: (newEndPointIdx: number) => void
  onDelete?: () => void
  /** When provided, renders an add-day (+) button. Passed only for the last
   * divider in the list — this component does not decide who is last. */
  onAddDay?: () => void
}

type RowSnapshot = {
  rects: { idx: number; midY: number }[]
  rectByIdx: Map<number, number>
  containerTop: number
  dividerMidY: number
}

const SCROLL_ZONE = 48

export function BoundaryDivider({
  boundary,
  totalDistanceNm,
  distanceUnit,
  avgSpeedKnots,
  labelDayNumber,
  labelDate,
  minDate,
  maxDate,
  footer,
  interactive = true,
  onDateChange,
  onBoundaryMove,
  onDelete,
  onAddDay,
}: BoundaryDividerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef<RowSnapshot | null>(null)
  const scrollElRef = useRef<HTMLElement | null>(null)
  // Tracks the target index during drag without triggering React re-renders.
  // onBoundaryMove is called only on pointerup so this component never
  // unmounts/remounts during a drag, keeping pointer capture intact.
  const dragTargetRef = useRef<number>(boundary.endIdx)

  const displayDist = legLabel(totalDistanceNm, avgSpeedKnots, distanceUnit)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragTargetRef.current = boundary.endIdx

    const scrollEl = e.currentTarget.closest("[data-point-list]") as HTMLElement | null
    if (!scrollEl || !containerRef.current) return
    scrollElRef.current = scrollEl

    const containerRect = scrollEl.getBoundingClientRect()
    const scrollTop = scrollEl.scrollTop

    const dividerRect = containerRef.current.getBoundingClientRect()
    const dividerMidY = (dividerRect.top + dividerRect.bottom) / 2 - containerRect.top + scrollTop

    const rows = scrollEl.querySelectorAll<HTMLElement>("[data-point-idx]")
    const rects: { idx: number; midY: number }[] = []
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const midY = (rect.top + rect.bottom) / 2 - containerRect.top + scrollTop
      rects.push({ idx: parseInt(row.dataset.pointIdx!, 10), midY })
    }
    rects.sort((a, b) => a.midY - b.midY)

    snapshotRef.current = {
      rects,
      rectByIdx: new Map(rects.map((r) => [r.idx, r.midY])),
      containerTop: containerRect.top,
      dividerMidY,
    }

    containerRef.current.style.zIndex = "9"
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const snapshot = snapshotRef.current
    const scrollEl = scrollElRef.current
    if (!snapshot || !scrollEl || snapshot.rects.length === 0) return

    // Auto-scroll when pointer is near the container edges.
    const containerRect = scrollEl.getBoundingClientRect()
    const distFromTop = e.clientY - containerRect.top
    const distFromBottom = containerRect.bottom - e.clientY
    if (distFromTop < SCROLL_ZONE) {
      scrollEl.scrollBy({ top: -Math.max(1, (SCROLL_ZONE - distFromTop) / 2), behavior: "instant" })
    } else if (distFromBottom < SCROLL_ZONE) {
      scrollEl.scrollBy({
        top: Math.max(1, (SCROLL_ZONE - distFromBottom) / 2),
        behavior: "instant",
      })
    }

    // Determine target row from snapshotted midpoints (container-relative coords
    // remain valid even as the container scrolls).
    const relY = e.clientY - snapshot.containerTop + scrollEl.scrollTop
    let targetIdx = snapshot.rects[0].idx
    for (const { idx, midY } of snapshot.rects) {
      if (relY >= midY) targetIdx = idx
      else break
    }
    dragTargetRef.current = targetIdx

    // Shift the divider visually via CSS transform — no React state update, no
    // re-render, no unmount, pointer capture is preserved for the full gesture.
    const targetMidY = snapshot.rectByIdx.get(targetIdx) ?? snapshot.dividerMidY
    const offset = targetMidY - snapshot.dividerMidY
    if (containerRef.current) {
      containerRef.current.style.transform = offset !== 0 ? `translateY(${offset}px)` : ""
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (containerRef.current) {
      containerRef.current.style.transform = ""
      containerRef.current.style.zIndex = ""
    }
    onBoundaryMove?.(dragTargetRef.current)
    snapshotRef.current = null
    scrollElRef.current = null
  }

  function handlePointerCancel(_e: React.PointerEvent<HTMLDivElement>) {
    if (containerRef.current) {
      containerRef.current.style.transform = ""
      containerRef.current.style.zIndex = ""
    }
    dragTargetRef.current = boundary.endIdx
    snapshotRef.current = null
    scrollElRef.current = null
  }

  const grip = (
    <span
      data-testid="boundary-grip"
      className="-ml-1 flex shrink-0 cursor-ns-resize touch-none items-center"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <GripVerticalIcon className="text-muted-foreground size-3.5" />
    </span>
  )

  const deleteButton = onDelete && (
    <button
      type="button"
      aria-label={`Delete day ${labelDayNumber}`}
      onClick={onDelete}
      className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
    >
      <Trash2Icon className="size-3.5" />
    </button>
  )

  const addButton = onAddDay && (
    <button
      type="button"
      aria-label={`Add day after day ${labelDayNumber}`}
      onClick={onAddDay}
      className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
    >
      <PlusIcon className="size-3.5" />
    </button>
  )

  // Non-interactive (view mode) has no grip, editable picker, or delete button —
  // "Day N · date · distance" alone never overflows the pane, so it stays one line.
  if (!interactive) {
    return (
      <div
        ref={containerRef}
        data-testid="boundary-label"
        className="border-border bg-muted/30 flex items-center gap-1.5 border-y px-3 py-1 text-xs font-medium select-none"
      >
        <span>Day {labelDayNumber}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatDayDate(labelDate)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground font-normal whitespace-nowrap">{displayDist}</span>
      </div>
    )
  }

  // Interactive (boundary-edit) mode: the grip is its own column, stretched to
  // the full height of both lines below — a larger drag target than confining
  // it to line 1 alone, without adding a third row. Line 1 is Day N · date ·
  // add (if last) · delete; line 2 is just the distance/time metrics, flush left
  // under the whole row. Drag is confined to the grip so the date picker and
  // action buttons receive normal clicks.
  return (
    <div
      ref={containerRef}
      data-testid="boundary-drag-handle"
      className="border-border bg-muted/30 flex items-stretch gap-2 border-y px-3 py-1.5 text-xs font-medium select-none"
    >
      {grip}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div data-testid="boundary-divider-line-1" className="flex items-center gap-2">
          <span data-testid="boundary-day-label" className="shrink-0">
            Day {labelDayNumber}
          </span>
          <DatePicker
            value={labelDate ?? ""}
            onChange={(v) => onDateChange?.(v || null)}
            placeholder="Add date"
            size="sm"
            minDate={minDate}
            maxDate={maxDate}
            footer={footer}
            className="h-6 w-auto border-none bg-transparent px-1 text-xs font-normal shadow-none"
          />
          {(addButton || deleteButton) && (
            <div className="ml-auto flex items-center gap-1">
              {addButton}
              {deleteButton}
            </div>
          )}
        </div>
        <span className="text-muted-foreground font-normal whitespace-nowrap">{displayDist}</span>
      </div>
    </div>
  )
}
