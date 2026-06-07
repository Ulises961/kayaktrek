import { getSession } from "@/lib/auth/session"
import { apiGet } from "@/lib/api/client"
import { TripPageSchema } from "@/lib/dtos/trip"
import { TripCard } from "@/components/common/trip-card"
import { PastTripsSection } from "@/components/trips/past-trips-section"
import { NewTripDialog } from "@/components/trips/new-trip-dialog"
import { StateVisual } from "@/components/illustrations/state-visual"
import CurrentPageTitle from "@/components/common/current-page-title"
import { redirect } from "next/navigation"

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="text-xs text-muted-foreground/50">{count}</span>
    </div>
  )
}

export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/login")

  const raw = await apiGet(`/api/trip/${session.userId}/all`)
  const { items: trips, total } = TripPageSchema.parse(raw)

  const happeningTrips = trips.filter((t) => t.state === "happening")
  const planningTrips = trips.filter((t) => t.state === "building")
  const pastTrips = trips
    .filter((t) => t.state === "past")
    .sort((a, b) => {
      if (!a.dateTo && !b.dateTo) return 0
      if (!a.dateTo) return 1
      if (!b.dateTo) return -1
      return b.dateTo.localeCompare(a.dateTo)
    })

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <CurrentPageTitle />
        <NewTripDialog />
      </div>
      {total === 0 ? (
        <div className="flex flex-col items-center gap-6 mt-16 xl:mt-24 text-center">
          <StateVisual state="empty" className="w-56 xl:w-80 2xl:w-96 3xl:w-[32rem] opacity-80" />
          <p className="text-muted-foreground text-sm xl:text-base 2xl:text-lg">
            No trips yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 mt-4">
          {happeningTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Happening" count={happeningTrips.length} />
              <div className="flex flex-col gap-3">
                {happeningTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} hero />
                ))}
              </div>
            </section>
          )}
          {planningTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Planning" count={planningTrips.length} />
              <div className="flex flex-col gap-3">
                {planningTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            </section>
          )}
          {pastTrips.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader label="Past" count={pastTrips.length} />
              <PastTripsSection trips={pastTrips} />
            </section>
          )}
        </div>
      )}
    </>
  )
}
