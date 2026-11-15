import type { ReactNode } from "react"
import Link from "next/link"
import { BackLink } from "@/components/common/back-link"
import { BrandLockup } from "@/components/common/brand-lockup"
import { SeasonBadge } from "@/components/explore/season-badge"
import { DifficultyBadge } from "@/components/common/difficulty-badge"
import { RouteDayBreakdown } from "@/components/explore/route-day-breakdown"
import { RouteDetailSection } from "@/components/explore/route-detail-section"
import { routePhotos } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { RoutePlaces } from "@/components/explore/route-places"
import { RouteGallery } from "@/components/explore/route-gallery"
import type { OriginalAuthor, PublicPlace } from "@/lib/dtos/itinerary"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { DISTANCE_UNIT, formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"

type Props = {
  route: RouteData
  season: string | null
  // The author's published places (M19 §4). A separate prop rather than a RouteData
  // field: RouteData is also built from explore listing rows and the landing chart,
  // neither of which has places, and this way they cannot silently arrive undefined.
  places?: PublicPlace[]
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
  places = [],
  author,
  tripState,
  backHref,
  backLabel,
  actions,
  unit = DISTANCE_UNIT.NM,
}: Props) {
  const isHistory = tripState === TRIP_STATE.PAST || tripState === TRIP_STATE.ARCHIVED

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

      {/* No fixed height: the content takes the room it needs and the panel above is
          what scrolls, so the padding at the foot is part of the scrolled content and
          the call to action rests clear of the edge instead of against it. */}
      <div className="flex flex-col gap-4 p-5 pb-8">
        <BackLink href={backHref} label={backLabel} />

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg leading-tight font-semibold">{route.name}</h1>
          <div className="flex items-center gap-1.5">
            {isHistory && (
              <span className="text-muted-foreground inline-flex items-center rounded-[3px] border border-current px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase opacity-90">
                Past
              </span>
            )}
            <DifficultyBadge difficulty={route.difficulty} />
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
        {route.description && (
          // Unclamped, unlike the listing card: this is the page someone opened in
          // order to read it. Open on arrival for the same reason, and foldable
          // because a long pitch would otherwise fill a phone's whole panel.
          <RouteDetailSection title="About this route" defaultOpen>
            <p data-testid="route-pitch" className="text-sm leading-relaxed">
              {route.description}
            </p>
          </RouteDetailSection>
        )}
        <RouteDayBreakdown
          days={route.days}
          avgSpeedKnots={route.avgSpeedKnots}
          unit={unit}
          defaultOpen={false}
        />
        <RoutePlaces places={places} />
        <RouteGallery photos={routePhotos(route)} />
        {author && (
          <p className="text-muted-foreground text-sm">
            Cloned from{" "}
            {author.linkable ? (
              <Link
                href={`/paddlers/${author.username}`}
                className="text-foreground font-medium hover:underline"
              >
                {author.username}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{author.username}</span>
            )}
          </p>
        )}
        {actions}
      </div>
    </div>
  )
}
