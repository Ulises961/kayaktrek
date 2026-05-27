"use client"
import { useRef } from "react"
import { GripVerticalIcon } from "lucide-react"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"

export type BoundaryDividerProps = {
  boundary: DraftBoundary
  totalDistanceNm: number
  distanceUnit: "nm" | "km"
  onBoundaryMove: (newEndPointIdx: number) => void
}

export function BoundaryDivider({
  boundary,
  totalDistanceNm,
  distanceUnit,
  onBoundaryMove,
}: BoundaryDividerProps) {
  const pillRef = useRef<HTMLDivElement>(null)

  const displayDist =
    distanceUnit === "nm"
      ? `${totalDistanceNm.toFixed(1)} nm`
      : `${(totalDistanceNm * 1.852).toFixed(1)} km`

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    // Find the point row element under the pointer and read its data-point-idx
    const elements = document.elementsFromPoint(e.clientX, e.clientY)
    for (const el of elements) {
      const idx = (el as HTMLElement).dataset?.pointIdx
      if (idx !== undefined) {
        onBoundaryMove(parseInt(idx, 10))
        return
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 border-y border-border bg-muted/50">
      <div className="flex-1 h-px bg-border" />
      <div
        ref={pillRef}
        data-testid="boundary-drag-handle"
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background border border-border text-xs font-medium cursor-ns-resize select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <GripVerticalIcon className="size-3 text-muted-foreground" />
        <span>Day {boundary.dayNumber}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{boundary.date ?? "No date"}</span>
        <span className="text-muted-foreground">·</span>
        <span>{displayDist}</span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
