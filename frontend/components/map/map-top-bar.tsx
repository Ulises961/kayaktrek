"use client"
import Link from "next/link"
import { ArrowLeftIcon, Undo2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

export type MapMode = "drop" | "assign"

type MapTopBarProps = {
  tripId: string
  tripName: string
  mode: MapMode
  onModeChange: (mode: MapMode) => void
  distanceUnit: "nm" | "km"
  onDistanceUnitChange: (unit: "nm" | "km") => void
  totalDistance: number
  dayCount: number
  isSaving?: boolean
  onRemoveLastWaypoint?: () => void
}

export function MapTopBar({
  tripId,
  tripName,
  mode,
  onModeChange,
  distanceUnit,
  onDistanceUnitChange,
  totalDistance,
  dayCount,
  isSaving = false,
  onRemoveLastWaypoint,
}: MapTopBarProps) {
  const displayDistance =
    distanceUnit === "nm"
      ? totalDistance.toFixed(1)
      : (totalDistance * 1.852).toFixed(1)

  return (
    <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center gap-4 px-4 h-12 bg-background/90 backdrop-blur-sm border-b border-border">
      <Link
        href={`/trips/${tripId}`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeftIcon className="size-4" />
        <span>{tripName}</span>
      </Link>

      <div className="flex-1" />

      {/* Mode toggle */}
      <div className="flex rounded-md border border-border overflow-hidden text-sm shrink-0">
        <button
          onClick={() => onModeChange("drop")}
          className={cn(
            "px-3 py-1 transition-colors",
            mode === "drop" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          Drop points
        </button>
        <button
          onClick={() => onModeChange("assign")}
          className={cn(
            "px-3 py-1 transition-colors border-l border-border",
            mode === "assign" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          Assign days
        </button>
      </div>

      <div className="flex-1" />

      {/* Stats strip */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
        {mode === "drop" && onRemoveLastWaypoint && (
          <button
            onClick={onRemoveLastWaypoint}
            aria-label="Remove last waypoint"
            className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
          >
            <Undo2Icon className="size-3.5" />
            <span>Remove last waypoint</span>
          </button>
        )}

        <span className="flex items-center gap-1.5">
          <span>{displayDistance}</span>
          <span className="flex rounded border border-border overflow-hidden text-xs">
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
        </span>
        <span>{dayCount} {dayCount === 1 ? "day" : "days"}</span>
        <span className="text-xs">{isSaving ? "Saving…" : "All changes saved"}</span>
      </div>
    </div>
  )
}
