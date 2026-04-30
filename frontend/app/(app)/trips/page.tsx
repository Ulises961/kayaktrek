import { getSession } from "@/lib/auth/session"
import { apiGet } from "@/lib/api/client"
import { TripPageSchema } from "@/lib/dtos/trip"
import { TripCard } from "@/components/common/trip-card"
import { NewTripDialog } from "@/components/trips/new-trip-dialog"
import { StateVisual } from "@/components/illustrations/state-visual"
import CurrentPageTitle from "@/components/common/current-page-title"
import { redirect } from "next/navigation"

export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/login")

  const raw = await apiGet(`/api/trip/${session.userId}/all`)
  const { items: trips, total } = TripPageSchema.parse(raw)

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
        <div className="flex flex-col gap-3 mt-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </>
  )
}
