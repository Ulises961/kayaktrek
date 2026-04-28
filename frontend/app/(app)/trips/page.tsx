import { getSession } from "@/lib/auth/session"
import { apiGet } from "@/lib/api/client"
import { TripPageSchema } from "@/lib/dtos/trip"
import { TripCard } from "@/components/common/trip-card"
import { NoTripsIllustration } from "@/components/illustrations/no-trips"
import CurrentPageTitle from "@/components/common/current-page-title"
import { redirect } from "next/navigation"

export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/login")

  const raw = await apiGet(`/api/trip/${session.userId}/all`)
  const { items: trips, total } = TripPageSchema.parse(raw)

  return (
    <>
      <CurrentPageTitle />
      {total === 0 ? (
        <div className="flex flex-col items-center gap-4 mt-16 text-center">
          <NoTripsIllustration className="w-56 opacity-80" />
          <p className="text-muted-foreground text-sm">
            No trips yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </>
  )
}
