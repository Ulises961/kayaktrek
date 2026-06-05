"use client"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TripState } from "@/lib/dtos/trip"

type MapTopBarProps = {
  tripId: string | null
  tripName: string
  distanceUnit: "nm" | "km"
  onDistanceUnitChange: (unit: "nm" | "km") => void
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
  const showEditRoute = viewMode && isLeader && tripState !== "past"
  const showDone = !viewMode
  const displayDistance =
    distanceUnit === "nm"
      ? totalDistance.toFixed(1)
      : (totalDistance * 1.852).toFixed(1)

  const unitToggle = (
    <span className="flex rounded border border-border overflow-hidden text-[10px]">
      <button
        onClick={() => onDistanceUnitChange("nm")}
        className={cn(
          "px-1.5 py-0.5 transition-colors",
          distanceUnit === "nm" ? "bg-muted font-medium text-foreground" : "hover:bg-muted"
        )}
      >
        nm
      </button>
      <button
        onClick={() => onDistanceUnitChange("km")}
        className={cn(
          "px-1.5 py-0.5 transition-colors border-l border-border",
          distanceUnit === "km" ? "bg-muted font-medium text-foreground" : "hover:bg-muted"
        )}
      >
        km
      </button>
    </span>
  )

  return (
    <div className="absolute top-0 left-0 right-0 z-[1001] flex flex-col bg-background/90 backdrop-blur-sm border-b border-border">
      {/* ── Row 1: always visible ── */}
      <div className="flex items-center gap-3 px-3 md:px-4 h-12">
        <Link
          href={tripId ? `/trips/${tripId}` : "/itinerary"}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0"
        >
          <ArrowLeftIcon className="size-4 shrink-0" />
          <span className="truncate max-w-[120px] md:max-w-none">
            {tripId ? tripName : "Itineraries"}
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop stats strip — hidden on mobile */}
        <div
          data-testid="stats-strip"
          className="hidden md:flex items-center gap-4 text-sm text-muted-foreground shrink-0"
        >
          <span className="flex items-center gap-1.5">
            <span>{displayDistance}</span>
            {unitToggle}
          </span>
          <label className="flex items-center gap-1.5 shrink-0">
            <span>Avg speed</span>
            <input
              type="number"
              min={1.0}
              max={6.0}
              step={0.1}
              value={avgSpeedKnots}
              aria-label="Average speed in knots"
              onChange={(e) => onAvgSpeedKnotsChange(parseFloat(e.target.value))}
              className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
            />
            <span>kn</span>
          </label>
          <span>{dayCount} {dayCount === 1 ? "day" : "days"}</span>
        </div>

        {/* Mode pill */}
        <span className={cn(
          "text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
          viewMode
            ? "border-border text-muted-foreground"
            : "border-primary text-primary bg-primary/10",
        )}>
          {viewMode ? "Viewing" : "Editing"}
        </span>

        {showEditRoute && (
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Edit route
          </button>
        )}

        {showDone && (
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Done
          </button>
        )}

        {/* Saving indicator — rendered once, visible on both viewports */}
        {isSaving && (
          <span className="text-xs text-muted-foreground shrink-0">Saving…</span>
        )}
      </div>

      {/* ── Row 2: mobile-only compact stats ── */}
      <div className="flex md:hidden items-center gap-3 px-3 h-10 text-xs text-muted-foreground border-t border-border/50">
        <span className="flex items-center gap-1.5 shrink-0">
          <span>{displayDistance}</span>
          {unitToggle}
        </span>
        <label className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={1.0}
            max={6.0}
            step={0.1}
            value={avgSpeedKnots}
            aria-label="Average speed in knots"
            onChange={(e) => onAvgSpeedKnotsChange(parseFloat(e.target.value))}
            className="w-11 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground focus:outline-none"
          />
          <span>kn</span>
        </label>
        <span className="shrink-0">{dayCount} {dayCount === 1 ? "day" : "days"}</span>
      </div>
    </div>
  )
}
