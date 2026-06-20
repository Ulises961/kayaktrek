"use client"
import { useState } from "react"
import { X, Anchor, CircleDot } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { routeLegs, legLabel, formatDistance } from "@/lib/itinerary/distance"
import { cn } from "@/lib/utils"
import { PointDetailModal } from "./point-detail-modal"
import type { Point } from "@/lib/dtos/point"

function TypeIcon({ type }: { type: string }) {
  if (type === "stop") return <Anchor className="size-3.5 shrink-0" />
  return <CircleDot className="size-3.5 shrink-0" />
}

/**
 * Leg from the previous stop to the given point (aggregating any intervening
 * pass-through positions), plus cumulative distance from the day's first point.
 * The leg is the actionable "since the last stop" figure; the total is secondary
 * context. Returns null for the day's first point (no inbound leg) and for points
 * not on a day's route. See `docs/adr/itinerary-frontend.md` (Paddle-time legs).
 */
function legDistance(
  point: Point,
  state: ReturnType<typeof useMapBuilder>["state"],
  unit: "nm" | "km",
  speedKnots: number,
): { legText: string; totalText: string } | null {
  if (!point.dayId) return null
  const dayPoints = state.pointOrder
    .map((id) => state.points.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p != null && p.dayId === point.dayId)
  const leg = routeLegs(dayPoints).find((l) => l.point.id === point.id)
  if (!leg || leg.isStart) return null
  return {
    legText: legLabel(leg.legNm, speedKnots, unit),
    totalText: `${formatDistance(leg.cumulativeNm, unit)} ${unit} total`,
  }
}

export function PointDetailSheet() {
  const {
    state,
    selectedPointId,
    setSelectedPointId,
    distanceUnit,
    avgSpeedKnots,
    isLeader,
    tripState,
  } = useMapBuilder()
  const [modalOpen, setModalOpen] = useState(false)

  const point = selectedPointId
    ? (state.points.find((p) => p.id === selectedPointId) ?? null)
    : null

  // Close the modal whenever the selected point changes or clears (render-time).
  const [prevPointId, setPrevPointId] = useState(selectedPointId)
  if (selectedPointId !== prevPointId) {
    setPrevPointId(selectedPointId)
    setModalOpen(false)
  }

  if (!point) return null

  const canEdit = isLeader && tripState !== "past"
  const leg = legDistance(point, state, distanceUnit, avgSpeedKnots)
  const imageCount = point.images?.length ?? 0
  const displayName = point.name || `${point.type ?? "position"}`

  return (
    <>
      <div
        data-testid="point-detail-sheet"
        className="border-border bg-background animate-in slide-in-from-bottom absolute inset-x-0 bottom-0 z-[1002] rounded-t-xl border-t shadow-2xl duration-200"
      >
        {/* drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="bg-border h-1 w-8 rounded-full" />
        </div>

        {/* header */}
        <div className="flex items-start justify-between px-4 pb-2">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <TypeIcon type={point.type ?? "position"} />
              <span className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
                {point.type ?? "position"}
              </span>
            </div>
            <p className="truncate text-sm font-semibold">{displayName}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelectedPointId(null)}
            className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* tiles */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <div className="bg-muted/40 rounded-lg px-2.5 py-2">
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              {leg ? `Avg speed ${avgSpeedKnots} kn` : "Leg"}
            </p>
            {leg ? (
              <>
                <p className="text-[11px] font-medium">{leg.legText}</p>
                <p className="text-muted-foreground/70 text-[9px]">{leg.totalText}</p>
              </>
            ) : (
              <p className="text-[11px] font-medium">Start</p>
            )}
          </div>

          <button
            type="button"
            data-testid="point-notes-tile"
            onClick={() => setModalOpen(true)}
            className="bg-muted/40 hover:bg-muted/70 rounded-lg px-2.5 py-2 text-left transition-colors"
          >
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              Notes
            </p>
            <p
              className={cn(
                "truncate text-[11px]",
                point.notes ? "text-foreground" : "text-muted-foreground/60 italic",
              )}
            >
              {point.notes ? point.notes : canEdit ? "Add…" : "—"}
            </p>
          </button>

          <button
            type="button"
            data-testid="point-images-tile"
            onClick={() => setModalOpen(true)}
            className="bg-muted/40 hover:bg-muted/70 rounded-lg px-2.5 py-2 text-left transition-colors"
          >
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              Images
            </p>
            <p
              className={cn(
                "text-[11px] font-medium",
                imageCount > 0 ? "text-primary" : "text-muted-foreground",
              )}
            >
              {imageCount}
            </p>
          </button>
        </div>
      </div>

      {modalOpen && (
        <PointDetailModal point={point} canEdit={canEdit} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
