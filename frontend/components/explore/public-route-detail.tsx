import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import { BackLink } from "@/components/common/back-link"
import { SeasonBadge } from "@/components/explore/season-badge"
import { RouteDayBreakdown } from "@/components/explore/route-day-breakdown"
import { daySummariesFromRoute } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { OriginalAuthor } from "@/lib/dtos/itinerary"

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

// The card/top-bar layout shared by the discoverable route detail (`/routes/[id]`,
// gated on Itinerary.is_public) and the unlisted story share (`/story/[token]`) — the
// content a visitor sees is identical either way; only the fetch and the offered
// actions (fork/open, discoverable-only) differ between the two pages.
//
// Renders only the top bar + floating card (both absolutely positioned) — the caller
// owns the `relative h-screen w-full` wrapper and lays the map underneath as a sibling.
export function PublicRouteDetail({
  route,
  season,
  author,
  tripState,
  backHref,
  backLabel,
  actions,
}: Props) {
  const isHistory = tripState === "past" || tripState === "archived"
  const daySummaries = daySummariesFromRoute(route)

  return (
    <Fragment>
      {/* Top bar — branding only; back navigation floats separately below/left so it
          doesn't compete for attention with the logo on the opposite corner. */}
      <div className="absolute top-0 right-0 left-0 z-[1001] border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <Link href="/" className="font-semibold tracking-tight text-slate-900">
          Kayak Expedition Planner
        </Link>
      </div>

      <BackLink
        href={backHref}
        label={backLabel}
        variant="floating"
        className="absolute top-20 left-6 z-[1001]"
      />
      {/* Detail card */}
      <div className="absolute bottom-6 left-1/2 z-[1001] w-[min(92vw,28rem)] -translate-x-1/2">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg leading-tight font-semibold text-slate-900">{route.name}</h1>
            <div className="flex items-center gap-1.5">
              {isHistory && (
                <span className="inline-flex items-center rounded-[3px] border border-current px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-slate-500 uppercase opacity-90">
                  Past
                </span>
              )}
              <SeasonBadge season={season} />
            </div>
          </div>
          <div className="flex gap-4 text-sm text-slate-600">
            {route.totalMiles != null && <span>{route.totalMiles.toFixed(1)} nm</span>}
            {route.dayCount > 0 && (
              <span>
                {route.dayCount} {route.dayCount === 1 ? "day" : "days"}
              </span>
            )}
          </div>
          <RouteDayBreakdown days={daySummaries} />
          {author && (
            <p className="text-sm text-slate-600">
              Cloned from{" "}
              {author.linkable ? (
                <Link
                  href={`/paddlers/${author.username}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {author.name ?? author.username}
                </Link>
              ) : (
                <span className="font-medium text-slate-900">{author.name ?? author.username}</span>
              )}
            </p>
          )}
          {actions}
        </div>
      </div>
    </Fragment>
  )
}
