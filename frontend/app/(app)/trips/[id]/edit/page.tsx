import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { TripSchema } from "@/lib/dtos/trip"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { EditTripForm } from "@/components/trips/edit-trip-form"
import { DeleteTripButton } from "@/components/trips/delete-trip-button"
import { Separator } from "@/components/ui/separator"

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let trip
  try {
    const raw = await apiGet(`/api/trip/${id}`)
    trip = TripSchema.parse(raw)
  } catch {
    notFound()
  }

  const session = await getSession()
  const { isLeader } = deriveMembership(trip, session)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit trip</h1>
      <EditTripForm trip={trip} />

      {isLeader && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h2 className="text-destructive text-sm font-semibold tracking-[0.08em] uppercase">
              Danger zone
            </h2>
            <DeleteTripButton tripId={trip.id!} destination={trip.destination} />
          </div>
        </>
      )}
    </div>
  )
}
