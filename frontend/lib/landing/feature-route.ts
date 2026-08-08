import type { RouteData } from "@/lib/itinerary/public-routes"

// A route can only frame an extent if it has two points to span.
const MIN_FRAMABLE_POSITIONS = 2

// The chart frames one passage — the longest published one — so it stays legible
// however far apart the published routes are. Distance ranks them, waypoint count
// is the fallback for routes with no computed distance, and id is the final
// tie-break so the same data always frames the same way.
export function pickFeatureRoute(routes: RouteData[]): RouteData | null {
  const framable = routes.filter((route) => route.positions.length >= MIN_FRAMABLE_POSITIONS)
  if (framable.length === 0) return null

  return framable.reduce((best, route) => {
    const byDistance = (route.totalMiles ?? 0) - (best.totalMiles ?? 0)
    if (byDistance !== 0) return byDistance > 0 ? route : best

    const byWaypoints = route.positions.length - best.positions.length
    if (byWaypoints !== 0) return byWaypoints > 0 ? route : best

    return route.id < best.id ? route : best
  })
}
