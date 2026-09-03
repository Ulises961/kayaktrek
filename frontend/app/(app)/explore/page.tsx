import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { getViewer } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"
import { PageHeading } from "@/components/common/page-heading"
import { ContentLayout } from "@/components/common/content-layout"

export default async function ExplorePage() {
  const [initial, me] = await Promise.all([searchPublicItineraries({ perPage: 20 }), getViewer()])

  return (
    <div className="flex flex-col xl:h-full">
      {/* Map beside results — the one content page that genuinely uses the
          horizontal axis, so it opts out of the shell's centred column. */}
      <ContentLayout layout="wide" />
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <PageHeading>Explore routes</PageHeading>
        <p className="text-muted-foreground text-sm">
          {initial.total === 0
            ? "No public routes yet"
            : `${initial.total} public ${initial.total === 1 ? "route" : "routes"}`}
        </p>
      </div>
      <div className="flex-1 xl:min-h-0">
        <ExploreDiscovery initial={initial} unit={me?.unitPreference ?? DISTANCE_UNIT.NM} />
      </div>
    </div>
  )
}
