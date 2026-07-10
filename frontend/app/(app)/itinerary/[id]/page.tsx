import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { getMe } from "@/lib/user/me"
import { ItinerarySchema } from "@/lib/dtos/itinerary"
import { TripSchema } from "@/lib/dtos/trip"
import type { TripState } from "@/lib/dtos/trip"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
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
  let tripState: TripState | null = null
  let isLeader = true

  const me = await getMe()
  const initialDistanceUnit = me?.unitPreference ?? DISTANCE_UNIT.NM

  if (itinerary.tripId) {
    try {
      const tripRaw = await apiGet(`/api/trip/${itinerary.tripId}`)
      const trip = TripSchema.parse(tripRaw)
      tripName = trip.destination ?? "Trip"
      tripState = trip.state ?? null

      const session = await getSession()
      if (session) {
        const travellers = trip.travellers ?? []
        const leaderMember = travellers.find((m) => m.role === "leader")
        isLeader = !!leaderMember && leaderMember.user.id === session.userId
      }
    } catch {
      // fall back to defaults
    }
  }

  return (
    <MapBuilder
      itinerary={itinerary}
      tripId={itinerary.tripId ?? null}
      tripName={tripName}
      tripState={tripState}
      isLeader={isLeader}
      initialDistanceUnit={initialDistanceUnit}
    />
  )
}
