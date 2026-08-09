import { notFound } from "next/navigation"
import MapLoader from "@/components/map/map-loader"
import { RouteDetailActions } from "@/components/explore/route-detail-actions"
import { PublicRouteDetail } from "@/components/explore/public-route-detail"
import { fetchPublicItineraryDetail, fetchItineraries } from "@/lib/itinerary/actions"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import { getSession } from "@/lib/auth/session"
import { getViewer } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { seasonOfDetail } from "@/lib/itinerary/season"

export default async function PublicRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [detail, session, me] = await Promise.all([
    fetchPublicItineraryDetail(id),
    getSession(),
    getViewer(),
  ])
  if (!detail) notFound()

  // The author already owns this route, so offer to open it rather than clone it into
  // a duplicate. fetchItineraries returns only the viewer's own routes, so membership
  // in that set is proof of ownership without leaking the owner from the public shape.
  const isOwner = session
    ? (await fetchItineraries()).some((itinerary) => itinerary.id === id)
    : false

  const route = extractRouteData(detail)
  const season = seasonOfDetail(detail)

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <MapLoader routes={[route]} />
      </div>
      <PublicRouteDetail
        route={route}
        season={season}
        author={detail.originalAuthor}
        tripState={detail.tripState}
        // /explore is cookie-gated (proxy.ts); an anonymous visitor following that
        // link would hit a login redirect instead of going back. Mirror the
        // /story/[token] page's precedent and send them home instead.
        backHref={session ? "/explore" : "/"}
        backLabel={session ? "All routes" : "Home"}
        actions={
          <RouteDetailActions itineraryId={id} isAuthenticated={!!session} isOwner={isOwner} />
        }
        unit={me?.unitPreference ?? DISTANCE_UNIT.NM}
      />
    </div>
  )
}
