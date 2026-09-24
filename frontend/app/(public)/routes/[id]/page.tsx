import { notFound } from "next/navigation"
import MapLoader from "@/components/map/map-loader"
import { RouteDetailActions } from "@/components/explore/route-detail-actions"
import { PublicRouteDetail } from "@/components/explore/public-route-detail"
import { PublicRouteShell } from "@/components/explore/public-route-shell"
import { fetchPublicItineraryDetail, fetchItineraries } from "@/lib/itinerary/actions"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import { getViewer, hasLiveSession } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { seasonOfDetail } from "@/lib/itinerary/season"

export default async function PublicRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // isSignedIn decides what this page offers — the back link's destination, the fork
  // action, whether ownership is worth checking — so it reads hasLiveSession rather than
  // asking whether a cookie exists. Credentials the API cannot use would otherwise buy a
  // "Fork this route" button that only reaches /login and an ownership fetch that 401s.
  // It shares getViewer's one cached /api/user/me call, so it costs no extra request.
  const [detail, isSignedIn, me] = await Promise.all([
    fetchPublicItineraryDetail(id),
    hasLiveSession(),
    getViewer(),
  ])
  if (!detail) notFound()

  // The author already owns this route, so offer to open it rather than clone it into
  // a duplicate. fetchItineraries returns only the viewer's own routes, so membership
  // in that set is proof of ownership without leaking the owner from the public shape.
  const isOwner = isSignedIn
    ? (await fetchItineraries()).some((itinerary) => itinerary.id === id)
    : false

  const route = extractRouteData(detail)
  const season = seasonOfDetail(detail)

  return (
    <PublicRouteShell map={<MapLoader routes={[route]} />}>
      <PublicRouteDetail
        route={route}
        season={season}
        places={detail.places}
        author={detail.originalAuthor}
        tripState={detail.tripState}
        // The library has an address per audience: `/` anonymously, `/explore` signed in,
        // with /explore redirecting to the root for anyone else. Picking the right one
        // here is what keeps "back" a single hop rather than a bounce through it.
        backHref={isSignedIn ? "/explore" : "/"}
        backLabel={isSignedIn ? "All routes" : "Home"}
        actions={
          <RouteDetailActions itineraryId={id} isAuthenticated={isSignedIn} isOwner={isOwner} />
        }
        unit={me?.unitPreference ?? DISTANCE_UNIT.NM}
      />
    </PublicRouteShell>
  )
}
