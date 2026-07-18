import { notFound } from "next/navigation"
import MapLoader from "@/components/map/map-loader"
import { PublicRouteDetail } from "@/components/explore/public-route-detail"
import { fetchStoryByToken } from "@/lib/itinerary/actions"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import { seasonOfDetail } from "@/lib/itinerary/season"
import { getMe } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

// Unlisted trip-narrative share (M7d): reachable by anyone with the link, whether or
// not the itinerary is also discoverable-public. Renders the same detail view as
// /routes/[id] — a route is either discoverable, unlisted, or both; the content shown
// doesn't change based on which door the visitor came through. No fork/open actions
// here (an unlisted share isn't necessarily forkable), and the back-link goes home
// rather than to /explore.
export default async function StoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [detail, me] = await Promise.all([fetchStoryByToken(token), getMe()])
  if (!detail) notFound()

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
        backHref="/"
        backLabel="Home"
        unit={me?.unitPreference ?? DISTANCE_UNIT.NM}
      />
    </div>
  )
}
