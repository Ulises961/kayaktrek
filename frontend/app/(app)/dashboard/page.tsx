import Link from "next/link"
import { MapIcon, CompassIcon, PlusIcon, CalendarIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripsSchema } from "@/lib/dtos/trip"
import { StateBadge } from "@/components/common/state-badge"
import { Button } from "@/components/ui/button"
import type { Trip } from "@/lib/dtos/trip"

async function fetchTrips(userId: string): Promise<Trip[]> {
  try {
    const raw = await apiGet<unknown[]>(`/api/trip/${userId}/all`)
    return TripsSchema.parse(raw)
  } catch {
    return []
  }
}

function HeroTrip({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-xl border border-border bg-card p-5 hover:bg-accent transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-base leading-tight">
            {trip.destination ?? "Untitled trip"}
          </h2>
          {trip.startDate && (
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
              <CalendarIcon className="size-3" />
              {trip.startDate}
              {trip.endDate ? ` → ${trip.endDate}` : ""}
            </p>
          )}
        </div>
        {trip.state && <StateBadge state={trip.state} />}
      </div>
      {trip.itinerary?.id && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
          <MapIcon className="size-3" />
          Itinerary ready — open to view the route
        </p>
      )}
    </Link>
  )
}

export default async function DashboardPage() {
  const session = await getSession()
  const trips = session ? await fetchTrips(session.userId) : []

  const happening = trips.filter((t) => t.state === "happening")
  const upcoming = trips.filter((t) => t.state === "building" || t.state === "planning")
  const heroTrips = [...happening, ...upcoming].slice(0, 3)
  const pastCount = trips.filter((t) => t.state === "past").length

  return (
    <div className="p-6 flex flex-col gap-8 max-w-2xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{session?.email ? `, ${session.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {trips.length === 0
            ? "You have no trips yet. Start planning your first expedition."
            : `${trips.length} ${trips.length === 1 ? "trip" : "trips"} total${pastCount > 0 ? `, ${pastCount} completed` : ""}.`}
        </p>
      </div>

      {/* Active / upcoming trips */}
      {heroTrips.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {happening.length > 0 ? "Active expedition" : "Upcoming"}
          </h2>
          {heroTrips.map((trip) => (
            <HeroTrip key={trip.id} trip={trip} />
          ))}
          {trips.length > heroTrips.length && (
            <Link
              href="/trips"
              className="text-sm text-primary hover:underline text-center py-1"
            >
              View all {trips.length} trips →
            </Link>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border p-8 flex flex-col items-center gap-4 text-center">
          <MapIcon className="size-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">No active or upcoming trips</p>
            <p className="text-sm text-muted-foreground mt-1">
              Plan a new expedition or explore public routes for inspiration.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/trips">
                <PlusIcon className="size-4 mr-1.5" />
                New trip
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/explore">
                <CompassIcon className="size-4 mr-1.5" />
                Explore routes
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* Quick links */}
      {heroTrips.length > 0 && (
        <section className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline">
            <Link href="/trips">
              <PlusIcon className="size-4 mr-1.5" />
              All trips
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/itinerary">
              <MapIcon className="size-4 mr-1.5" />
              My itineraries
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/explore">
              <CompassIcon className="size-4 mr-1.5" />
              Explore routes
            </Link>
          </Button>
        </section>
      )}
    </div>
  )
}
