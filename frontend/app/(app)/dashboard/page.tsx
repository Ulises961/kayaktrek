import Link from "next/link"
import { MapIcon, CompassIcon, PlusIcon, CalendarIcon, BellIcon, KayakIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TRIP_STATE, TripPageSchema } from "@/lib/dtos/trip"
import { getMe } from "@/lib/user/me"
import { getPendingRequestsSummary } from "@/lib/requests/actions"
import { buildPendingRequestRows } from "@/lib/requests/pending"
import { StateBadge } from "@/components/common/state-badge"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
import { ActiveExpeditionCard } from "@/components/dashboard/active-expedition-card"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { ListRow } from "@/components/common/list-row"
import { PageHeading } from "@/components/common/page-heading"
import { Button } from "@/components/ui/button"
import { extractItineraryRoute } from "@/lib/itinerary/public-routes"
import { formatDateRange } from "@/lib/trips/format"
import type { Trip } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { EmptyState } from "@/components/common/empty-state"

async function fetchTrips(userId: string): Promise<Trip[]> {
  // No catch: let apiGet's redirect("/login") (a thrown NEXT_REDIRECT) propagate, and
  // let a genuine fetch/parse failure surface rather than masquerade as "no trips".
  // /api/trip/<id>/all returns a paginated envelope { items, total, page, pages }.
  const raw = await apiGet<unknown>(`/api/trip/${userId}/all`)
  return TripPageSchema.parse(raw).items
}

function HeroTrip({ trip, route }: { trip: Trip; route: RouteData | null }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="border-border bg-card hover:bg-secondary block overflow-hidden rounded-xl border transition-colors"
    >
      {/* The trip's passage on the same sea chart as the landing — flush to the card
          edges, text below. No thumbnail when the trip has no plotted route yet. */}
      {route && <RouteThumbnail route={route} />}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base leading-tight font-semibold">
              {trip.destination ?? "Untitled trip"}
            </h2>
            {trip.dateFrom && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm">
                <CalendarIcon className="size-3" />
                {formatDateRange(trip.dateFrom, trip.dateTo)}
              </p>
            )}
          </div>
          {trip.state && <StateBadge state={trip.state} />}
        </div>
        {!route && trip.itinerary?.id && (
          <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
            <MapIcon className="size-3" />
            Itinerary ready — open to view the route
          </p>
        )}
      </div>
    </Link>
  )
}

// One "someone is waiting on you" row per pending-request type (trip
// invitations, buddy requests, endorsement asks) — mirrors the sidebar's
// SidebarRequestsMenu, sharing the same row derivation so the two surfaces
// never disagree on labels or destinations. Shown alongside the trips section
// (whether hero trips or the empty-trips placeholder), not gated behind it —
// hidden entirely when nothing is pending.
function PendingRequestsSection({
  pendingRequests,
}: {
  pendingRequests: Awaited<ReturnType<typeof getPendingRequestsSummary>>
}) {
  const rows = buildPendingRequestRows(pendingRequests)
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium tracking-wide uppercase">
        <BellIcon className="size-3.5" />
        Pending requests
      </h2>
      <ul className="border-border bg-card overflow-hidden rounded-xl border">
        {rows.map((row) => (
          <ListRow key={row.href} as="li">
            <Link href={row.href} className="hover:bg-secondary block px-4 py-3 text-sm">
              {row.label}
            </Link>
          </ListRow>
        ))}
      </ul>
    </section>
  )
}

export default async function DashboardPage() {
  const session = await getSession()
  const [user, trips, pendingRequests] = await Promise.all([
    session ? getMe() : Promise.resolve(null),
    session ? fetchTrips(session.userId) : Promise.resolve([]),
    getPendingRequestsSummary(),
  ])

  const happening = trips.filter((t) => t.state === TRIP_STATE.HAPPENING)
  const upcoming = trips.filter((t) => t.state === TRIP_STATE.BUILDING)
  const heroTrips = [...happening, ...upcoming].slice(0, 3)
  const pastCount = trips.filter((t) => t.state === TRIP_STATE.PAST).length

  // Each shown trip's own route, drawn as the chart thumbnail in its card — the
  // landing's sea chart carried into the app, one passage per card. No extra
  // requests: the trips envelope already nests each itinerary's days+points, so
  // the route is derived from data in hand (M12 phase 9b follow-up — this was
  // previously a redundant per-trip fetch).
  const heroRoutes: (RouteData | null)[] = heroTrips.map((t) => {
    if (!t.itinerary) return null
    const route = extractItineraryRoute(t.itinerary)
    return route.positions.length > 0 ? route : null
  })

  return (
    <>
      {/* Greeting */}
      <div>
        <PageHeading>Welcome back{user?.username ? `, ${user.username}` : ""}</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">
          {trips.length === 0
            ? "You have no trips yet. Start planning your first expedition."
            : `${trips.length} ${trips.length === 1 ? "trip" : "trips"} total${pastCount > 0 ? `, ${pastCount} completed` : ""}.`}
        </p>
      </div>

      <PendingRequestsSection pendingRequests={pendingRequests} />

      {/* Active / upcoming trips */}
      {heroTrips.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            {happening.length > 0 ? "Active expedition" : "Upcoming"}
          </h2>
          {heroTrips.map((trip, i) =>
            // A trip that is actually under way gets the live panel — progress, the day's
            // conditions, crew, and the way into position sharing. Everything else keeps
            // the route-thumbnail card, which is the right shape for a plan rather than
            // an expedition in progress.
            trip.state === TRIP_STATE.HAPPENING ? (
              <ActiveExpeditionCard key={trip.id} trip={trip} route={heroRoutes[i]} />
            ) : (
              <HeroTrip key={trip.id} trip={trip} route={heroRoutes[i]} />
            ),
          )}
          {trips.length > heroTrips.length && (
            <Link href="/trips" className="text-primary py-1 text-center text-sm hover:underline">
              View all {trips.length} trips →
            </Link>
          )}
        </section>
      ) : (
        <EmptyState
          icon={KayakIcon}
          title="No active or upcoming trips"
          description="Plan a new expedition or explore public routes for inspiration."
          action={
            <>
              <Button asChild size="sm" className={cn("w-full sm:w-auto", ctaButtonClass)}>
                <Link href="/trips">
                  <PlusIcon className="mr-1.5 size-4" />
                  New trip
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link href="/explore">
                  <CompassIcon className="mr-1.5 size-4" />
                  Explore routes
                </Link>
              </Button>
            </>
          }
        />
      )}

      {/* Quick links */}
      {heroTrips.length > 0 && (
        <section className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/trips">
              <PlusIcon className="mr-1.5 size-4" />
              All trips
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/itinerary">
              <MapIcon className="mr-1.5 size-4" />
              My itineraries
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/explore">
              <CompassIcon className="mr-1.5 size-4" />
              Explore routes
            </Link>
          </Button>
        </section>
      )}
    </>
  )
}
