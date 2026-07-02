import { searchPublicItineraries, fetchItineraries } from "@/lib/itinerary/actions"
import { getSession } from "@/lib/auth/session"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"

export default async function ExplorePage() {
  const [initial, session] = await Promise.all([
    searchPublicItineraries({ perPage: 20 }),
    getSession(),
  ])

  // The viewer's own routes get an "open" affordance instead of a duplicate-creating
  // fork. fetchItineraries returns only routes they own, so their ids are safe to expose.
  const ownedIds = session
    ? (await fetchItineraries()).map((itinerary) => itinerary.id).filter((id): id is string => !!id)
    : []

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
        <ExploreDiscovery initial={initial} isAuthenticated={!!session} ownedIds={ownedIds} />
      </div>
    </div>
  )
}
