"use client"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"
import { DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"

type MapTopBarProps = {
  tripId: string | null
  tripName: string
  distanceUnit: DistanceUnit
  onDistanceUnitChange: (unit: DistanceUnit) => void
  totalDistance: number
  dayCount: number
  isSaving?: boolean
  avgSpeedKnots: number
  onAvgSpeedKnotsChange: (v: number) => void
  viewMode?: boolean
  onToggleViewMode?: () => void
  isLeader?: boolean
  tripState?: TripState | null
}

export function MapTopBar({
  tripId,
  tripName,
  distanceUnit,
  onDistanceUnitChange,
  totalDistance,
  dayCount,
  isSaving = false,
  avgSpeedKnots,
  onAvgSpeedKnotsChange,
  viewMode = false,
  onToggleViewMode = () => {},
  isLeader = true,
  tripState = null,
}: MapTopBarProps) {
  const showEditRoute = viewMode && isLeader && tripState !== TRIP_STATE.PAST
  const showDone = !viewMode
  const displayDistance =
    distanceUnit === DISTANCE_UNIT.NM
      ? totalDistance.toFixed(1)
      : (totalDistance * 1.852).toFixed(1)

  const unitToggle = (
    <span className="border-border flex overflow-hidden rounded border text-[10px]">
      <button
        onClick={() => onDistanceUnitChange(DISTANCE_UNIT.NM)}
        className={cn(
          "px-1.5 py-0.5 transition-colors",
          distanceUnit === DISTANCE_UNIT.NM
            ? "bg-muted text-foreground font-medium"
            : "hover:bg-muted",
        )}
      >
        nm
      </button>
      <button
        onClick={() => onDistanceUnitChange(DISTANCE_UNIT.KM)}
        className={cn(
          "border-border border-l px-1.5 py-0.5 transition-colors",
          distanceUnit === DISTANCE_UNIT.KM
            ? "bg-muted text-foreground font-medium"
            : "hover:bg-muted",
        )}
      >
        km
      </button>
    </span>
  )

  return (
    <div className="bg-background/90 border-border absolute top-0 right-0 left-0 z-[1001] flex flex-col border-b backdrop-blur-sm">
      {/* ── Row 1: always visible ── */}
      <div className="flex h-12 items-center gap-3 px-3 md:px-4">
        <Link
          href={tripId ? `/trips/${tripId}` : "/itinerary"}
          className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4 shrink-0" />
          <span className="max-w-[120px] truncate md:max-w-none">
            {tripId ? tripName : "Itineraries"}
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop stats strip — hidden on mobile */}
        <div
          data-testid="stats-strip"
          className="text-muted-foreground hidden shrink-0 items-center gap-4 text-sm md:flex"
        >
          <span className="flex items-center gap-1.5">
            <span>{displayDistance}</span>
            {unitToggle}
          </span>
          <label className="flex shrink-0 items-center gap-1.5">
            <span>Avg speed</span>
            <input
              type="number"
              min={1.0}
              max={6.0}
              step={0.1}
              value={avgSpeedKnots}
              aria-label="Average speed in knots"
              onChange={(e) => onAvgSpeedKnotsChange(parseFloat(e.target.value))}
              className="border-border bg-background text-foreground w-14 rounded border px-1.5 py-0.5 text-xs focus:outline-none"
            />
            <span>kn</span>
          </label>
          <span>
            {dayCount} {dayCount === 1 ? "day" : "days"}
          </span>
        </div>

        {/* Mode pill */}
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            viewMode
              ? "border-border text-muted-foreground"
              : "border-primary text-primary bg-primary/10",
          )}
        >
          {viewMode ? "Viewing" : "Editing"}
        </span>

        {showEditRoute && (
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-primary shrink-0 text-xs font-medium hover:underline"
          >
            Edit route
          </button>
        )}

        {showDone && (
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-primary shrink-0 text-xs font-medium hover:underline"
          >
            Done
          </button>
        )}

        {/* Saving indicator — rendered once, visible on both viewports */}
        {isSaving && <span className="text-muted-foreground shrink-0 text-xs">Saving…</span>}
      </div>

      {/* ── Row 2: mobile-only compact stats ── */}
      <div className="text-muted-foreground border-border/50 flex h-10 items-center gap-3 border-t px-3 text-xs md:hidden">
        <span className="flex shrink-0 items-center gap-1.5">
          <span>{displayDistance}</span>
          {unitToggle}
        </span>
        <label className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min={1.0}
            max={6.0}
            step={0.1}
            value={avgSpeedKnots}
            aria-label="Average speed in knots"
            onChange={(e) => onAvgSpeedKnotsChange(parseFloat(e.target.value))}
            className="border-border bg-background text-foreground w-11 rounded border px-1 py-0.5 text-xs focus:outline-none"
          />
          <span>kn</span>
        </label>
        <span className="shrink-0">
          {dayCount} {dayCount === 1 ? "day" : "days"}
        </span>
      </div>
    </div>
  )
}
