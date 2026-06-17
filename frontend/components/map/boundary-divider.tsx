"use client"
import { useRef } from "react"
import { GripVerticalIcon, Trash2Icon } from "lucide-react"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import { legLabel } from "@/lib/itinerary/distance"
import { formatDayDate } from "@/lib/itinerary/format"
import { DatePicker } from "@/components/common/date-picker"

export type BoundaryDividerProps = {
  boundary: DaySlice
  totalDistanceNm: number
  distanceUnit: "nm" | "km"
  avgSpeedKnots: number
  labelDayNumber: number
  labelDate: string | null
  interactive?: boolean
  onDateChange?: (date: string | null) => void
  onBoundaryMove?: (newEndPointIdx: number) => void
  onDelete?: () => void
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
  interactive = true,
  onDateChange,
  onBoundaryMove,
  onDelete,
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

  // The day boundary handle mirrors the static Day 1 header: a full-width bar
  // with "Day N · date · distance". Drag-to-reassign is confined to the grip so
  // the inline date picker and delete button receive normal clicks.
  return (
    <div
      ref={containerRef}
      data-testid={interactive ? "boundary-drag-handle" : "boundary-label"}
      className="border-border bg-muted/30 flex items-center gap-1.5 border-y px-3 py-1 text-xs font-medium select-none"
    >
      {interactive && (
        <span
          data-testid="boundary-grip"
          className="-ml-1 shrink-0 cursor-ns-resize touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <GripVerticalIcon className="text-muted-foreground size-3.5" />
        </span>
      )}
      <span>Day {labelDayNumber}</span>
      <span className="text-muted-foreground">·</span>
      {interactive ? (
        <DatePicker
          value={labelDate ?? ""}
          onChange={(v) => onDateChange?.(v || null)}
          placeholder="Add date"
          size="sm"
          className="h-6 w-auto border-none bg-transparent px-1 text-xs font-normal shadow-none"
        />
      ) : (
        <span className="text-muted-foreground">{formatDayDate(labelDate)}</span>
      )}
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground font-normal whitespace-nowrap">{displayDist}</span>
      {interactive && onDelete && (
        <button
          type="button"
          aria-label={`Delete day ${labelDayNumber}`}
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive ml-auto shrink-0 transition-colors"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
