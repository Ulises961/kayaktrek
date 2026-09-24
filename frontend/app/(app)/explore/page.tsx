import { redirect } from "next/navigation"
import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { getViewer, hasLiveSession } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"
import { PageHeading } from "@/components/common/page-heading"
import { ContentLayout } from "@/components/common/content-layout"

export default async function ExplorePage() {
  // Signed out, the library already has a home: `/`, which M23 made the front door and
  // which frames the same listing as a chart with the pitch, the intro and Sign up on it.
  // This render only earns its keep inside the app shell, so the anonymous half defers
  // rather than serving a one-item sidebar and a second indexable copy of the listing.
  //
  // A redirect, deliberately not an entry in proxy.ts's AUTH_GATED_PREFIXES: the gate
  // answers with /login, and sending a visitor who never claimed to be signed in to a
  // login form is the dead end M23 §1 closed. Temporary (307) — the destination depends
  // on who is asking, so a cacheable 308 would follow the signed-in visitor too.
  if (!(await hasLiveSession())) redirect("/")

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
