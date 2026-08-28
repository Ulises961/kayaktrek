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
            {/* The icon is what makes the label wrap, not the words. A tile is two-up on a
                320px viewport, and the icon plus its gap costs ~22px of that — enough to
                push "Endorsements", the longest label, onto a second line. Grid rows
                stretch to their tallest cell, so one wrapped label leaves the tile beside
                it half empty. Dropping the icon at base keeps every label on one line at
                full size, so the tiles stay a uniform height. */}
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icon className="hidden size-3.5 shrink-0 sm:block" />
              {label}
            </span>
            {/* The value carries the size reduction at base, not the label: `text-xl` is
                1.25rem against a 112.5% root (~22px), which next to a 13.5px label reads
                as two unrelated type sizes in a 122px tile rather than one figure. */}
            <span className="text-sm font-semibold tabular-nums sm:text-xl">{value}</span>
          </div>
        ))}
      </div>

      {/* Conditions distribution */}
      {conditions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Sea conditions
          </p>
          {/* Same squeeze as the month rows below: w-24 + w-6 and two gap-3s take 162px of
              the ~219px this card has at 320, leaving the bar under 40px. A narrower chip
              column and tighter gap leave it about 100px. */}
          <ul className="flex flex-col gap-1.5">
            {conditions.map(({ beaufort, count }) => (
              <li key={beaufort} className="flex items-center gap-2 text-sm sm:gap-3">
                <span className="w-16 shrink-0 sm:w-24">
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
          {/* The fixed columns are what squeeze the bar. Measured at 320 the card is about
              219px wide, and w-14 + w-20 + w-12 with three gap-3s took 247px of it — the
              flex-1 bar was left under 10px, which is not a chart. Narrower columns plus
              dropping the log count to `sr-only` at base leave it about 93px.
              The count is dropped rather than shrunk because it is the one column that
              repeats what the bar already shows; `sr-only` keeps it announced, so nothing
              is lost to a screen reader. Everything returns from sm. */}
          <ul className="flex flex-col gap-1.5">
            {months.map((m) => (
              <li key={m.month} className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
                <span className="text-muted-foreground w-10 shrink-0 text-[11px] whitespace-nowrap sm:w-14 sm:text-xs">
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
                    <span className="w-14 shrink-0 text-right tabular-nums sm:w-20">
                      {tidy(toDisplay(m.distance))} {unit}
                    </span>
                    <span className="sr-only sm:not-sr-only sm:w-12 sm:shrink-0 sm:text-right sm:text-xs sm:tabular-nums">
                      {m.count} {m.count === 1 ? "log" : "logs"}
                    </span>
                  </>
                ) : (
                  // An em dash, not "0 km" — the paddler recorded nothing that
                  // month, which is not the same as paddling zero distance.
                  <>
                    <span className="text-muted-foreground w-14 shrink-0 text-right sm:w-20">
                      —
                    </span>
                    <span className="sr-only sm:not-sr-only sm:w-12 sm:shrink-0 sm:text-right sm:text-xs">
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
