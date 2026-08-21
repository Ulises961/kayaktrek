"use client"
import { cn } from "@/lib/utils"
import { CardTopRule } from "@/components/common/card-top-rule"
import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"
import { DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"
import { useBreadcrumbs } from "@/hooks/use-breadcrumbs"
import type { Crumb } from "@/lib/types/ui"

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
  // Navigate is a member-facing overlay state (M8), not part of the leader-only
  // View/Edit toggle — off by default so it never appears outside a happening trip.
  showNavigate?: boolean
  navigateMode?: boolean
  onToggleNavigate?: () => void
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
  showNavigate = false,
  navigateMode = false,
  onToggleNavigate = () => {},
}: MapTopBarProps) {
  const canEdit = isLeader && tripState !== TRIP_STATE.PAST
  const editDisabled = viewMode && !canEdit
  const displayDistance =
    distanceUnit === DISTANCE_UNIT.NM
      ? totalDistance.toFixed(1)
      : (totalDistance * 1.852).toFixed(1)

  const crumbs: Crumb[] = tripId
    ? [
        { label: "Trips", href: "/trips" },
        { label: tripName, href: `/trips/${tripId}` },
        { label: "Itinerary" },
      ]
    : [{ label: "Itineraries", href: "/itinerary" }, { label: "Itinerary" }]

  useBreadcrumbs(crumbs)

  const editTitle = editDisabled
    ? tripState === TRIP_STATE.PAST
      ? "This trip has passed"
      : "Only the leader can edit the route"
    : undefined

  const modeControl = (
    <div
      role="group"
      aria-label="View mode"
      className="border-border flex shrink-0 overflow-hidden rounded border text-xs"
    >
      <button
        type="button"
        aria-pressed={viewMode}
        onClick={() => {
          if (!viewMode) onToggleViewMode()
        }}
        className={cn(
          "px-2.5 py-1 font-medium transition-colors",
          viewMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
      >
        View
      </button>
      <button
        type="button"
        aria-pressed={!viewMode}
        disabled={editDisabled}
        title={editTitle}
        onClick={() => {
          if (viewMode && canEdit) onToggleViewMode()
        }}
        className={cn(
          "border-border border-l px-2.5 py-1 font-medium transition-colors",
          !viewMode
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        )}
      >
        Edit
      </button>
      {showNavigate && (
        <button
          type="button"
          aria-pressed={navigateMode}
          onClick={onToggleNavigate}
          className={cn(
            "border-border border-l px-2.5 py-1 font-medium transition-colors",
            navigateMode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Navigate
        </button>
      )}
    </div>
  )

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
    // Deliberately NOT the global nav header's bg-background + border-b — this is an
    // in-page instrument panel sitting directly beneath that h-12 bar, and the two
    // read as one double-height "mega header" without a distinct identity. The
    // chart-paper tint plus the maritime top-rule as its bottom edge mark it as the
    // planner's own tool strip (M12 §E).
    <div className="bg-surface-2/95 absolute top-0 right-0 left-0 z-[1001] flex flex-col backdrop-blur-sm">
      {/* ── Row 1: always visible ── */}
      <div className="flex h-12 items-center gap-3 px-3 md:px-4">
        {/* Below `sm` the header breadcrumb is not rendered and the day rail's own
            header is dropped, so this row is the only place the trip is named. It
            doubles as the spacer that holds the mode control to the right edge. */}
        <p className="min-w-0 flex-1 truncate text-sm font-medium sm:hidden">{tripName}</p>
        <div className="hidden flex-1 sm:block" />

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

        {modeControl}

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

      {/* Bottom edge: the chart motif instead of a plain border-b. */}
      <CardTopRule />
    </div>
  )
}
