import { getSession } from "@/lib/auth/session"
import { apiGet } from "@/lib/api/client"
import { TripPageSchema } from "@/lib/dtos/trip"
import { TripCard } from "@/components/common/trip-card"
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
        <p className="text-muted-foreground text-sm mt-8 text-center">
          No trips yet. Create one to get started.
        </p>
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
