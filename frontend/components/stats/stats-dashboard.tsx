import { SeaStateChip } from "@/components/logs/sea-state-chip"
import { RouteIcon, ClockIcon, NotebookIcon, MapIcon, BadgeCheckIcon } from "lucide-react"
import type { Stats } from "@/lib/dtos/public-profile"

interface StatsDashboardProps {
  stats: Stats
}

// Round to at most one decimal place, dropping a trailing ".0".
function tidy(value: number): string {
  return Number(value.toFixed(1)).toString()
}

const MONTH_LABEL = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" })

function monthLabel(month: string): string {
  // month is "YYYY-MM"; build a UTC date to avoid timezone drift.
  const [year, m] = month.split("-").map(Number)
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

export function StatsDashboard({ stats }: StatsDashboardProps) {
  const headline = [
    { label: "Distance", value: `${tidy(stats.totalDistance)} km`, icon: RouteIcon },
    { label: "Hours", value: tidy(stats.totalHours), icon: ClockIcon },
    { label: "Logs", value: String(stats.logCount), icon: NotebookIcon },
    { label: "Trips", value: String(stats.tripCount), icon: MapIcon },
    { label: "Endorsements", value: String(stats.endorsementsReceived), icon: BadgeCheckIcon },
  ]

  const conditions = Object.entries(stats.conditionsDistribution)
    .map(([beaufort, count]) => ({ beaufort: Number(beaufort), count }))
    .sort((a, b) => a.beaufort - b.beaufort)
  const maxConditionCount = Math.max(1, ...conditions.map((c) => c.count))

  const maxMonthDistance = Math.max(1, ...stats.activityByMonth.map((m) => m.distance))

  if (stats.logCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No paddling logged yet. Stats appear here once logs are recorded.
      </p>
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
            <span className="text-xl font-semibold tabular-nums">{value}</span>
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

      {/* Activity over time */}
      {stats.activityByMonth.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Distance by month
          </p>
          <div className="flex items-end gap-1.5" style={{ height: "80px" }}>
            {stats.activityByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="bg-primary/60 w-full rounded-t-sm"
                    style={{ height: `${Math.max(4, (m.distance / maxMonthDistance) * 100)}%` }}
                    title={`${monthLabel(m.month)}: ${tidy(m.distance)} km, ${m.count} log(s)`}
                  />
                </div>
                <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                  {monthLabel(m.month)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
