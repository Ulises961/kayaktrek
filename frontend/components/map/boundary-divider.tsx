"use client"
import { useRef } from "react"
import { GripVerticalIcon } from "lucide-react"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import { legLabel } from "@/lib/itinerary/distance"

export type BoundaryDividerProps = {
  boundary: DaySlice
  totalDistanceNm: number
  distanceUnit: "nm" | "km"
  avgSpeedKnots: number
  labelDayNumber: number
  labelDate: string | null
  onDateChange?: (date: string | null) => void
  onBoundaryMove: (newEndPointIdx: number) => void
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
  onDateChange,
  onBoundaryMove,
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
      scrollEl.scrollBy({ top: Math.max(1, (SCROLL_ZONE - distFromBottom) / 2), behavior: "instant" })
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
    onBoundaryMove(dragTargetRef.current)
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

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 px-2 py-1 border-y border-border bg-muted/50">
      <div className="flex-1 h-px bg-border shrink-0 min-w-[0.5rem]" />
      <div
        data-testid="boundary-drag-handle"
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border cursor-ns-resize select-none shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <GripVerticalIcon className="size-3 text-muted-foreground shrink-0" />
        {/* 1/3 — day number */}
        <span className="text-xs font-semibold w-10 text-center shrink-0">
          Day {labelDayNumber}
        </span>
        <div className="w-px h-7 bg-border shrink-0" />
        {/* 2/3 — date + distance stacked */}
        <div className="flex flex-col gap-0.5">
          <input
            type="date"
            value={labelDate ?? ""}
            placeholder="No date"
            onChange={(e) => onDateChange?.(e.target.value || null)}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-foreground bg-transparent border-none outline-none cursor-pointer w-28 sm:w-32"
          />
          <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">
            {displayDist}
          </span>
        </div>
      </div>
      <div className="flex-1 h-px bg-border shrink-0 min-w-[0.5rem]" />
    </div>
  )
}
