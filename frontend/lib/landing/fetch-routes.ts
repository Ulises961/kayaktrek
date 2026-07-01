import { apiGetPublic } from "@/lib/api/client"
import { PublicItinerariesSchema, PublicItineraryDetailSchema } from "@/lib/dtos/itinerary"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Public route data for the chart surfaces (landing hero + auth backdrop). Reads
// the unauthenticated explore listing, then hydrates each itinerary's public
// detail. Fully best-effort: any failure degrades to an empty list so the chart
// still renders calm water (cellForRoutes handles the empty case).
export async function fetchLandingRoutes(): Promise<RouteData[]> {
  try {
    const list = PublicItinerariesSchema.parse(
      await apiGetPublic<unknown[]>("/api/itinerary/explore"),
    )
    const ids = list.map((i) => i.id).filter(Boolean) as string[]
    const details = await Promise.all(
      ids.slice(0, 20).map(async (id) => {
        try {
          const raw = await apiGetPublic<unknown>(`/api/itinerary/${id}/public`)
          return PublicItineraryDetailSchema.parse(raw)
        } catch {
          return null
        }
      }),
    )
    return details.filter(Boolean).map((d) => extractRouteData(d!))
  } catch {
    return []
  }
}
