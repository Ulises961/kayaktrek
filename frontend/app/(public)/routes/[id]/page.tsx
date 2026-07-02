import Link from "next/link"
import { notFound } from "next/navigation"
import MapLoader from "@/components/map/map-loader"
import { SeasonBadge } from "@/components/explore/season-badge"
import { RouteDetailActions } from "@/components/explore/route-detail-actions"
import { RouteDayBreakdown } from "@/components/explore/route-day-breakdown"
import { fetchPublicItineraryDetail, fetchItineraries } from "@/lib/itinerary/actions"
import { extractRouteData, extractDaySummaries } from "@/lib/itinerary/public-routes"
import { getSession } from "@/lib/auth/session"
import { seasonOfDetail } from "@/lib/itinerary/season"

export default async function PublicRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [detail, session] = await Promise.all([fetchPublicItineraryDetail(id), getSession()])
  if (!detail) notFound()

  // The author already owns this route, so offer to open it rather than clone it into
  // a duplicate. fetchItineraries returns only the viewer's own routes, so membership
  // in that set is proof of ownership without leaking the owner from the public shape.
  const isOwner = session
    ? (await fetchItineraries()).some((itinerary) => itinerary.id === id)
    : false

  const route = extractRouteData(detail)
  const daySummaries = extractDaySummaries(detail)
  const season = seasonOfDetail(detail)
  const author = detail.originalAuthor

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <MapLoader routes={[route]} />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 right-0 left-0 z-[1001] flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <Link href="/" className="font-semibold tracking-tight text-slate-900">
          Kayak Expedition Planner
        </Link>
        <Link href="/explore" className="text-sm text-slate-600 hover:underline">
          ← All routes
        </Link>
      </div>

      {/* Detail card */}
      <div className="absolute bottom-6 left-1/2 z-[1001] w-[min(92vw,28rem)] -translate-x-1/2">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg leading-tight font-semibold text-slate-900">{route.name}</h1>
            <SeasonBadge season={season} />
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
          <RouteDetailActions itineraryId={id} isAuthenticated={!!session} isOwner={isOwner} />
        </div>
      </div>
    </div>
  )
}
