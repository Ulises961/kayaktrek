import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { ItinerarySchema } from "@/lib/dtos/itinerary"
import { TripSchema } from "@/lib/dtos/trip"
import { MapBuilder } from "@/components/map/map-builder"

export default async function ItineraryBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let itinerary
  try {
    const raw = await apiGet(`/api/itinerary/${id}`)
    itinerary = ItinerarySchema.parse(raw)
  } catch {
    notFound()
  }

  let tripName = "Trip"
  if (itinerary.tripId) {
    try {
      const tripRaw = await apiGet(`/api/trip/${itinerary.tripId}`)
      const trip = TripSchema.parse(tripRaw)
      tripName = trip.destination ?? "Trip"
    } catch {
      // fall back to default
    }
  }

  return (
    <MapBuilder
      itinerary={itinerary}
      tripId={itinerary.tripId ?? ""}
      tripName={tripName}
    />
  )
}
