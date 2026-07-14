import { getSession } from "@/lib/auth/session"
import { apiGetAllPages } from "@/lib/api/paginate"
import { TRIP_STATE, TripPageSchema } from "@/lib/dtos/trip"
import { fetchTripRoute } from "@/lib/itinerary/actions"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { TripCard } from "@/components/common/trip-card"
import { PastTripsSection } from "@/components/trips/past-trips-section"
import { PlanningTripsSection } from "@/components/trips/planning-trips-section"
import { NewTripDialog } from "@/components/trips/new-trip-dialog"
import { StateVisual } from "@/components/illustrations/state-visual"
import CurrentPageTitle from "@/components/common/current-page-title"
import { redirect } from "next/navigation"

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        {label}
      </span>
      <span className="text-muted-foreground/50 text-xs">{count}</span>
    </div>
  )
}

export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/login")

  const { items: trips, total } = await apiGetAllPages(
    `/api/trip/${session.userId}/all`,
    TripPageSchema,
  )

  // Each trip's own route, drawn as the chart banner on its card (M12 §E) — the
  // dashboard's Promise.all pattern applied to the full list. Best-effort: a trip
  // without an itinerary (or a failed fetch) simply shows no map.
  const routes = await Promise.all(
    trips.map((t) => (t.itinerary?.id ? fetchTripRoute(t.itinerary.id) : Promise.resolve(null))),
  )
  const routesById: Record<string, RouteData | null> = {}
  trips.forEach((t, i) => {
    if (t.id) routesById[t.id] = routes[i]
  })

  const happeningTrips = trips.filter((t) => t.state === TRIP_STATE.HAPPENING)
  const planningTrips = trips.filter((t) => t.state === TRIP_STATE.BUILDING)
  const pastTrips = trips
    .filter((t) => t.state === TRIP_STATE.PAST)
    .sort((a, b) => {
      if (!a.dateTo && !b.dateTo) return 0
      if (!a.dateTo) return 1
      if (!b.dateTo) return -1
      return b.dateTo.localeCompare(a.dateTo)
    })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <CurrentPageTitle />
        <NewTripDialog />
      </div>
      {total === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-6 text-center xl:mt-24">
          <StateVisual state="empty" className="3xl:w-[32rem] w-56 opacity-80 xl:w-80 2xl:w-96" />
          <p className="text-muted-foreground text-sm xl:text-base 2xl:text-lg">
            No trips yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {happeningTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Happening" count={happeningTrips.length} />
              <div className="flex flex-col gap-3">
                {happeningTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} hero route={routesById[trip.id ?? ""]} />
                ))}
              </div>
            </section>
          )}
          {planningTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Planning" count={planningTrips.length} />
              <PlanningTripsSection trips={planningTrips} routesById={routesById} />
            </section>
          )}
          {pastTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Past" count={pastTrips.length} />
              <PastTripsSection trips={pastTrips} routesById={routesById} />
            </section>
          )}
        </div>
      )}
    </>
  )
}
