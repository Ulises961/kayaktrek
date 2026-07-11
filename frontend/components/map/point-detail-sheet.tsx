"use client"
import { useState } from "react"
import { X, Anchor, CircleDot } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { routeLegs, legLabel, formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"
import { cn } from "@/lib/utils"
import { PointDetailModal } from "./point-detail-modal"
import { POINT_TYPE, type Point } from "@/lib/dtos/point"
import { TRIP_STATE } from "@/lib/dtos/trip"

function TypeIcon({ type }: { type: string }) {
  if (type === POINT_TYPE.STOP) return <Anchor className="size-3.5 shrink-0" />
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
  unit: DistanceUnit,
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

  const canEdit = isLeader && tripState !== TRIP_STATE.PAST
  const leg = legDistance(point, state, distanceUnit, avgSpeedKnots)
  const imageCount = point.images?.length ?? 0
  const displayName = point.name || `${point.type ?? "position"}`

  return (
    <>
      <div
        data-testid="point-detail-sheet"
        role="button"
        tabIndex={0}
        onClick={() => setModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setModalOpen(true)
          }
        }}
        className="border-border bg-background/20 hover:bg-background animate-in slide-in-from-bottom absolute inset-x-0 bottom-0 z-[1002] rounded-t-xl border-t text-left shadow-2xl backdrop-blur-sm transition-colors duration-250"
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
            onClick={(e) => {
              e.stopPropagation()
              setSelectedPointId(null)
            }}
            className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* tiles — presentational; the whole sheet (this included) opens the modal. */}
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

          <div data-testid="point-notes-tile" className="bg-muted/40 rounded-lg px-2.5 py-2">
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
          </div>

          <div data-testid="point-images-tile" className="bg-muted/40 rounded-lg px-2.5 py-2">
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
          </div>
        </div>
      </div>

      {modalOpen && (
        <PointDetailModal point={point} canEdit={canEdit} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
