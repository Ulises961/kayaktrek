import type { ReactNode } from "react"
import Link from "next/link"
import { BackLink } from "@/components/common/back-link"
import { SeasonBadge } from "@/components/explore/season-badge"
import { RouteDayBreakdown } from "@/components/explore/route-day-breakdown"
import { daySummariesFromRoute } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { OriginalAuthor } from "@/lib/dtos/itinerary"
import { TRIP_STATE } from "@/lib/dtos/trip"

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
}

// The docked side-panel layout shared by the discoverable route detail
// (`/routes/[id]`, gated on Itinerary.is_public) and the unlisted story share
// (`/story/[token]`) — the content a visitor sees is identical either way; only the
// fetch and the offered actions (fork/open, discoverable-only) differ between the
// two pages.
//
// Renders as a flex sibling of the map, not an overlay on top of it — the caller
// owns the `flex h-screen w-full` wrapper and lays the map in a `flex-1` column
// beside this panel (M12 §B/2.6 — the card used to float over the route it was
// meant to frame).
export function PublicRouteDetail({
  route,
  season,
  author,
  tripState,
  backHref,
  backLabel,
  actions,
}: Props) {
  const isHistory = tripState === TRIP_STATE.PAST || tripState === TRIP_STATE.ARCHIVED
  const daySummaries = daySummariesFromRoute(route)

  return (
    <div
      data-testid="route-detail-panel"
      className="border-border bg-background flex h-full w-full shrink-0 flex-col overflow-y-auto border-l sm:w-96"
    >
      <div className="border-border shrink-0 border-b px-5 py-4">
        <Link href="/" className="text-foreground font-semibold tracking-tight">
          Kayak Expedition Planner
        </Link>
      </div>

      <div className="flex flex-col gap-4 p-5">
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
          {route.totalMiles != null && <span>{route.totalMiles.toFixed(1)} nm</span>}
          {route.dayCount > 0 && (
            <span>
              {route.dayCount} {route.dayCount === 1 ? "day" : "days"}
            </span>
          )}
        </div>
        <RouteDayBreakdown days={daySummaries} />
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
