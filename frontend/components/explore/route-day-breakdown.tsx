import { formatDayDate } from "@/lib/utils/date"
import { DISTANCE_UNIT, formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"
import type { DaySummary } from "@/lib/itinerary/public-routes"

// Per-day mileage breakdown shown on the public route detail page so planners can see
// how the distance is split across days before choosing to use the route.
export function RouteDayBreakdown({
  days,
  unit = DISTANCE_UNIT.NM,
}: {
  days: DaySummary[]
  unit?: DistanceUnit
}) {
  if (days.length === 0) return null

  return (
    <div className="border-border flex flex-col gap-1 border-t pt-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Daily breakdown
      </p>
      <ul className="divide-border/50 max-h-40 divide-y overflow-y-auto">
        {days.map((day) => (
          <li
            key={day.dayNumber}
            className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
          >
            <span className="font-medium">Day {day.dayNumber}</span>
            {day.date && (
              <span className="text-muted-foreground flex-1">{formatDayDate(day.date)}</span>
            )}
            <span className="text-muted-foreground tabular-nums">
              {formatDistance(day.distanceNm, unit)} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
