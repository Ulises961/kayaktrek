import { searchPublicItineraries, fetchPublicRouteData } from "@/lib/itinerary/actions"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Public route data for the chart surfaces (landing hero + auth backdrop). Reads
// the unauthenticated explore listing, then hydrates each itinerary's public
// detail. Fully best-effort: any failure degrades to an empty list so the chart
// still renders calm water (cellForRoutes handles the empty case).
export async function fetchLandingRoutes(): Promise<RouteData[]> {
  try {
    const page = await searchPublicItineraries({ perPage: 20 })
    const routes = await Promise.all(page.items.map((item) => fetchPublicRouteData(item.id)))
    return routes.filter((r): r is RouteData => r !== null)
  } catch {
    return []
  }
}
