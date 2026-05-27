"use client"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type MapTopBarProps = {
  tripId: string | null
  tripName: string
  distanceUnit: "nm" | "km"
  onDistanceUnitChange: (unit: "nm" | "km") => void
  totalDistance: number
  dayCount: number
  isSaving?: boolean
}

export function MapTopBar({
  tripId,
  tripName,
  distanceUnit,
  onDistanceUnitChange,
  totalDistance,
  dayCount,
  isSaving = false,
}: MapTopBarProps) {
  const displayDistance =
    distanceUnit === "nm"
      ? totalDistance.toFixed(1)
      : (totalDistance * 1.852).toFixed(1)

  return (
    <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center gap-4 px-4 h-12 bg-background/90 backdrop-blur-sm border-b border-border">
      <Link
        href={tripId ? `/trips/${tripId}` : "/itinerary"}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeftIcon className="size-4" />
        <span>{tripId ? tripName : "Itineraries"}</span>
      </Link>

      <div className="flex-1" />

      {/* Stats strip */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
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
