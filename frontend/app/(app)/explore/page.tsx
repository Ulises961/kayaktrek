import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { getSession } from "@/lib/auth/session"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"

export default async function ExplorePage() {
  const [initial, session] = await Promise.all([
    searchPublicItineraries({ perPage: 20 }),
    getSession(),
  ])

  return (
    <div className="flex flex-col xl:h-full">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Explore routes</h1>
        <p className="text-muted-foreground text-sm">
          {initial.total === 0
            ? "No public routes yet"
            : `${initial.total} public ${initial.total === 1 ? "route" : "routes"}`}
        </p>
      </div>
      <div className="flex-1 xl:min-h-0">
        <ExploreDiscovery initial={initial} isAuthenticated={!!session} />
      </div>
    </div>
  )
}
