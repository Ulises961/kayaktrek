import Link from "next/link"
import { MapIcon, CompassIcon, PlusIcon, CalendarIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TRIP_STATE, TripPageSchema } from "@/lib/dtos/trip"
import { getMe } from "@/lib/user/me"
import { StateBadge } from "@/components/common/state-badge"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { Button } from "@/components/ui/button"
import { fetchTripRoute } from "@/lib/itinerary/actions"
import { formatDateRange } from "@/lib/trips/format"
import type { Trip } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"

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

export default async function DashboardPage() {
  const session = await getSession()
  const user = session ? await getMe() : null
  const trips = session ? await fetchTrips(session.userId) : []

  const happening = trips.filter((t) => t.state === TRIP_STATE.HAPPENING)
  const upcoming = trips.filter((t) => t.state === TRIP_STATE.BUILDING)
  const heroTrips = [...happening, ...upcoming].slice(0, 3)
  const pastCount = trips.filter((t) => t.state === TRIP_STATE.PAST).length

  // Each shown trip's own route, drawn as the chart thumbnail in its card — the
  // landing's sea chart carried into the app, one passage per card. Best-effort and
  // parallel; a trip without an itinerary (or a failed fetch) simply shows no map.
  const heroRoutes = await Promise.all(
    heroTrips.map((t) =>
      t.itinerary?.id ? fetchTripRoute(t.itinerary.id) : Promise.resolve(null),
    ),
  )

  return (
    <div className="flex max-w-2xl flex-col gap-8 p-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{user?.username ? `, ${user.username}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {trips.length === 0
            ? "You have no trips yet. Start planning your first expedition."
            : `${trips.length} ${trips.length === 1 ? "trip" : "trips"} total${pastCount > 0 ? `, ${pastCount} completed` : ""}.`}
        </p>
      </div>

      {/* Active / upcoming trips */}
      {heroTrips.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            {happening.length > 0 ? "Active expedition" : "Upcoming"}
          </h2>
          {heroTrips.map((trip, i) => (
            <HeroTrip key={trip.id} trip={trip} route={heroRoutes[i]} />
          ))}
          {trips.length > heroTrips.length && (
            <Link href="/trips" className="text-primary py-1 text-center text-sm hover:underline">
              View all {trips.length} trips →
            </Link>
          )}
        </section>
      ) : (
        <section className="border-border flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
          <MapIcon className="text-muted-foreground/40 size-10" />
          <div>
            <p className="font-medium">No active or upcoming trips</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Plan a new expedition or explore public routes for inspiration.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild size="sm" className="w-full sm:w-auto">
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
          </div>
        </section>
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
    </div>
  )
}
