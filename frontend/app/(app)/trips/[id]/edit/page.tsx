import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { TripSchema } from "@/lib/dtos/trip"
import { EditTripForm } from "@/components/trips/edit-trip-form"

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let trip
  try {
    const raw = await apiGet(`/api/trip/${id}`)
    trip = TripSchema.parse(raw)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit trip</h1>
      <EditTripForm trip={trip} />
    </div>
  )
}
