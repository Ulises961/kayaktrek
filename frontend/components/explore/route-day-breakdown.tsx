import { formatDayDate } from "@/lib/itinerary/format"
import type { DaySummary } from "@/lib/itinerary/public-routes"

// Per-day mileage breakdown shown on the public route detail page so planners can see
// how the distance is split across days before choosing to use the route.
export function RouteDayBreakdown({ days }: { days: DaySummary[] }) {
  if (days.length === 0) return null

  return (
    <div className="flex flex-col gap-1 border-t border-slate-200 pt-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Daily breakdown</p>
      <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
        {days.map((day) => (
          <li
            key={day.dayNumber}
            className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
          >
            <span className="font-medium text-slate-900">Day {day.dayNumber}</span>
            {day.date && <span className="flex-1 text-slate-500">{formatDayDate(day.date)}</span>}
            <span className="text-slate-600 tabular-nums">{day.distanceNm.toFixed(1)} nm</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
