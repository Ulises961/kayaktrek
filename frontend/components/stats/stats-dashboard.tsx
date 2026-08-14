import { SeaStateChip } from "@/components/logs/sea-state-chip"
import { RouteIcon, ClockIcon, NotebookIcon, MapIcon, BadgeCheckIcon } from "lucide-react"
import type { Stats } from "@/lib/dtos/public-profile"
import { DISTANCE_UNIT, toNm, type DistanceUnit } from "@/lib/itinerary/distance"
import { monthSeries, ACTIVITY_MONTH_WINDOW } from "@/lib/logs/activity"
import { EmptyState } from "@/components/common/empty-state"
import { ActivityIcon } from "lucide-react"

interface StatsDashboardProps {
  stats: Stats
  unit?: DistanceUnit
}

// Round to at most one decimal place, dropping a trailing ".0".
function tidy(value: number): string {
  return Number(value.toFixed(1)).toString()
}

// Proportional bar width, floored at a visible sliver. The previous chart floored
// at 4% of the tallest bar, so every month next to a large outlier collapsed to
// exactly the same nub — it drew a flat distribution it did not have.
const MIN_BAR_PCT = 1.5

function barWidth(distance: number, max: number): number {
  return distance === 0 ? 0 : Math.max(MIN_BAR_PCT, (distance / max) * 100)
}

const MONTH_LABEL = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" })

function monthLabel(month: string): string {
  // month is "YYYY-MM"; build a UTC date to avoid timezone drift.
  const [year, m] = month.split("-").map(Number)
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

export function StatsDashboard({ stats, unit = DISTANCE_UNIT.KM }: StatsDashboardProps) {
  const toDisplay = (km: number) => (unit === DISTANCE_UNIT.NM ? toNm(km) : km)

  const headline = [
    {
      label: "Distance",
      value: `${tidy(toDisplay(stats.totalDistance))} ${unit}`,
      icon: RouteIcon,
    },
    { label: "Hours", value: tidy(stats.totalHours), icon: ClockIcon },
    { label: "Logs", value: String(stats.logCount), icon: NotebookIcon },
    { label: "Trips", value: String(stats.tripCount), icon: MapIcon },
    { label: "Endorsements", value: String(stats.endorsementsReceived), icon: BadgeCheckIcon },
  ]

  const conditions = Object.entries(stats.conditionsDistribution)
    .map(([beaufort, count]) => ({ beaufort: Number(beaufort), count }))
    .sort((a, b) => a.beaufort - b.beaufort)
  const maxConditionCount = Math.max(1, ...conditions.map((c) => c.count))

  // A single month is a number, not a distribution — there is nothing to compare
  // it against, and one full-height bar implies a trend that isn't there.
  const months = monthSeries(stats.activityByMonth, ACTIVITY_MONTH_WINDOW)
  const showActivity = months.length > 1
  const maxMonthDistance = Math.max(1, ...months.map((m) => m.distance))

  if (stats.logCount === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No paddling logged yet"
        description="Distance, time on the water and your busiest months appear here once you record a log."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {headline.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-muted/40 flex flex-col gap-1 rounded-lg p-3">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icon className="size-3.5" />
              {label}
            </span>
            {/* `text-xl` is 1.25rem against a 112.5% root — ~22px, which is out of
                proportion in a tile two-up on a 320px viewport. Full size from `sm`. */}
            <span className="text-base font-semibold tabular-nums sm:text-xl">{value}</span>
          </div>
        ))}
      </div>

      {/* Conditions distribution */}
      {conditions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Sea conditions
          </p>
          <ul className="flex flex-col gap-1.5">
            {conditions.map(({ beaufort, count }) => (
              <li key={beaufort} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0">
                  <SeaStateChip value={beaufort} />
                </span>
                <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-primary/60 block h-full rounded-full"
                    style={{ width: `${(count / maxConditionCount) * 100}%` }}
                  />
                </span>
                <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity over time. Same row grammar as Sea conditions above — label,
          magnitude, value — so the two read as one card rather than as two chart
          languages, and so the number is on screen without a hover. The previous
          vertical bars put every value in a `title` tooltip, which does not fire
          on touch at all: on a phone, and on the public profile where the reader
          has no logs to fall back on, the chart carried no numbers whatsoever. */}
      {showActivity && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Distance by month
            </p>
            <p className="text-muted-foreground text-[10px]">last {months.length} months</p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {months.map((m) => (
              <li key={m.month} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-14 shrink-0 text-xs whitespace-nowrap">
                  {monthLabel(m.month)}
                </span>
                <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-primary/60 block h-full rounded-full"
                    style={{ width: `${barWidth(m.distance, maxMonthDistance)}%` }}
                  />
                </span>
                {m.hasData ? (
                  <>
                    <span className="w-20 shrink-0 text-right tabular-nums">
                      {tidy(toDisplay(m.distance))} {unit}
                    </span>
                    <span className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
                      {m.count} {m.count === 1 ? "log" : "logs"}
                    </span>
                  </>
                ) : (
                  // An em dash, not "0 km" — the paddler recorded nothing that
                  // month, which is not the same as paddling zero distance.
                  <>
                    <span className="text-muted-foreground w-20 shrink-0 text-right">—</span>
                    <span className="text-muted-foreground w-12 shrink-0 text-right text-xs">
                      no logs
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
