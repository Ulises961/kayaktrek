import { apiGetPublic } from "@/lib/api/client"
import { PublicItinerariesSchema, PublicItineraryDetailSchema } from "@/lib/dtos/itinerary"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import { getSession } from "@/lib/auth/session"
import { ExploreClient } from "@/components/explore/explore-client"

async function fetchRoutes() {
  try {
    const list = PublicItinerariesSchema.parse(
      await apiGetPublic<unknown[]>("/api/itinerary/explore"),
    )
    const ids = list.map((i) => i.id).filter(Boolean) as string[]

    const details = await Promise.all(
      ids.map(async (id) => {
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

export default async function ExplorePage() {
  const [routes, session] = await Promise.all([fetchRoutes(), getSession()])

  return (
    <div className="flex flex-col xl:h-full">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Explore routes</h1>
        <p className="text-muted-foreground text-sm">
          {routes.length === 0
            ? "No public routes yet"
            : `${routes.length} public ${routes.length === 1 ? "route" : "routes"}`}
        </p>
      </div>
      <div className="flex-1 xl:min-h-0">
        <ExploreClient routes={routes} isAuthenticated={!!session} />
      </div>
    </div>
  )
}
