"use client"
import { cn } from "@/lib/utils"
import { formatDistance, formatTime, estimatedTime } from "@/lib/itinerary/distance"

export type DayStripCardProps = {
  dayNumber: number
  date: string | null
  distanceNm: number
  avgSpeedKnots: number
  distanceUnit: "nm" | "km"
  isSelected: boolean
  isToday: boolean
  isPastDay: boolean
  onClick: () => void
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export function DayStripCard({
  dayNumber,
  date,
  distanceNm,
  avgSpeedKnots,
  distanceUnit,
  isSelected,
  isToday,
  isPastDay,
  onClick,
}: DayStripCardProps) {
  const dist = formatDistance(distanceNm, distanceUnit)
  const time = formatTime(estimatedTime(distanceNm, avgSpeedKnots))

  return (
    <button
      type="button"
      role="button"
      onClick={onClick}
      data-selected={isSelected ? "true" : undefined}
      data-today={isToday ? "true" : undefined}
      data-past={isPastDay ? "true" : undefined}
      className={cn(
        "flex items-stretch rounded-lg border text-left text-xs shrink-0 w-36 h-full transition-all overflow-hidden",
        "border-border bg-background/80 hover:bg-muted/60",
        isSelected && "border-primary bg-muted ring-1 ring-primary",
        isToday && "border-primary bg-primary/10 font-medium",
        isPastDay && "opacity-50",
      )}
    >
      <div className="flex flex-col items-start gap-1 px-2 py-2 flex-1 min-w-0">
        <span className="font-semibold text-foreground">Day {dayNumber}</span>
        <span className="text-muted-foreground">{date ? formatDate(date) : "No date"}</span>
        <span className="text-muted-foreground">
          {dist} {distanceUnit} · {time}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          No data
        </span>
      </div>
    </button>
  )
}
