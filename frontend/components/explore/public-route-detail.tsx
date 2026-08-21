import type { ReactNode } from "react"
import Link from "next/link"
import { BackLink } from "@/components/common/back-link"
import { BrandLockup } from "@/components/common/brand-lockup"
import { SeasonBadge } from "@/components/explore/season-badge"
import { RouteDayBreakdown } from "@/components/explore/route-day-breakdown"
import { daySummariesFromRoute } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { OriginalAuthor } from "@/lib/dtos/itinerary"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { DISTANCE_UNIT, formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"

type Props = {
  route: RouteData
  season: string | null
  author?: OriginalAuthor | null
  // Parent trip's lifecycle state (M7d) — `past`/`archived` frame the same content as
  // history rather than an in-progress plan; `building`/`happening` show it as-is.
  // Read-only display seam; M8's live-position layer attaches here while `happening`.
  tripState?: string | null
  backHref: string
  backLabel: string
  actions?: ReactNode
  unit?: DistanceUnit
}

// The right-hand detail panel shared by the discoverable route detail
// (`/routes/[id]`, gated on Itinerary.is_public) and the unlisted story share
// (`/story/[token]`) — the content a visitor sees is identical either way; only the
// fetch and the offered actions (fork/open, discoverable-only) differ between the
// two pages.
//
// Fills whatever slot `PublicRouteShell` gives it: a docked column from `md`, an
// overlay that slides in from the right below it. This is content only — the shell
// owns the width, the open state and the toggle.
export function PublicRouteDetail({
  route,
  season,
  author,
  tripState,
  backHref,
  backLabel,
  actions,
  unit = DISTANCE_UNIT.NM,
}: Props) {
  const isHistory = tripState === TRIP_STATE.PAST || tripState === TRIP_STATE.ARCHIVED
  const daySummaries = daySummariesFromRoute(route)

  return (
    <div
      data-testid="route-detail-panel"
      className="border-border bg-background flex h-full w-full flex-col overflow-y-auto border-l"
    >
      {/* Brand strip. This panel IS the chrome on /routes/[id] and /story/[token]
          — both are full-height map splits with no room for a header bar above
          them — so the lockup lives here rather than in a ChartHeaderBar. */}
      <div className="border-border shrink-0 border-b px-5 py-4">
        <BrandLockup size={20} wordmarkClassName="text-sm" />
      </div>

      {/* `min-h-0 flex-1` hands the day list whatever height is left instead of
          leaving it stranded above empty panel — on a viewport taller than it is
          wide, that is most of the panel. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <BackLink href={backHref} label={backLabel} />

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg leading-tight font-semibold">{route.name}</h1>
          <div className="flex items-center gap-1.5">
            {isHistory && (
              <span className="text-muted-foreground inline-flex items-center rounded-[3px] border border-current px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase opacity-90">
                Past
              </span>
            )}
            <SeasonBadge season={season} />
          </div>
        </div>
        <div className="text-muted-foreground flex gap-4 text-sm">
          {route.totalMiles != null && (
            <span>
              {formatDistance(route.totalMiles, unit)} {unit}
            </span>
          )}
          {route.dayCount > 0 && (
            <span>
              {route.dayCount} {route.dayCount === 1 ? "day" : "days"}
            </span>
          )}
        </div>
        <RouteDayBreakdown days={daySummaries} unit={unit} />
        {author && (
          <p className="text-muted-foreground text-sm">
            Cloned from{" "}
            {author.linkable ? (
              <Link
                href={`/paddlers/${author.username}`}
                className="text-foreground font-medium hover:underline"
              >
                {author.name ?? author.username}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{author.name ?? author.username}</span>
            )}
          </p>
        )}
        {actions}
      </div>
    </div>
  )
}
