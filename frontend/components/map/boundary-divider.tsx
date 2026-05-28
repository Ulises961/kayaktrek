"use client"
import { useRef } from "react"
import { GripVerticalIcon } from "lucide-react"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"
import { legLabel } from "@/lib/itinerary/distance"

export type BoundaryDividerProps = {
  boundary: DraftBoundary
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
  const dragTargetRef = useRef<number>(boundary.endPointIdx)

  const displayDist = legLabel(totalDistanceNm, avgSpeedKnots, distanceUnit)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragTargetRef.current = boundary.endPointIdx

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
    dragTargetRef.current = boundary.endPointIdx
    snapshotRef.current = null
    scrollElRef.current = null
  }

  return (
    <div ref={containerRef} className="flex items-center gap-2 px-3 py-1 border-y border-border bg-muted/50">
      <div className="flex-1 h-px bg-border" />
      <div
        data-testid="boundary-drag-handle"
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background border border-border text-xs font-medium cursor-ns-resize select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <GripVerticalIcon className="size-3 text-muted-foreground" />
        <span>Day {labelDayNumber}</span>
        <span className="text-muted-foreground">·</span>
        <input
          type="date"
          value={labelDate ?? ""}
          placeholder="No date"
          onChange={(e) => onDateChange?.(e.target.value || null)}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer w-[6.5rem]"
        />
        <span className="text-muted-foreground">·</span>
        <span>{displayDist}</span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
