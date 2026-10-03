import { notFound } from "next/navigation"
import { apiGet, rethrowIfRedirect, rethrowUnlessClientError } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { getMe } from "@/lib/user/me"
import { ItinerarySchema } from "@/lib/dtos/itinerary"
import { TripSchema, TRIP_STATE } from "@/lib/dtos/trip"
import type { TripState } from "@/lib/dtos/trip"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { deriveMembership } from "@/lib/trips/membership"
import { MapBuilder } from "@/components/map/map-builder"
import { TripChangesListener } from "@/components/trips/trip-changes-listener"

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
  } catch (error) {
    rethrowUnlessClientError(error)
    notFound()
  }

  let tripName = "Trip"
  let tripDateFrom: string | null = null
  let tripDateTo: string | null = null
  let tripState: TripState | null = null
  let isLeader = true
  let showNavigate = false
  let isTripMember = false

  const me = await getMe()
  const initialDistanceUnit = me?.unitPreference ?? DISTANCE_UNIT.NM

  if (itinerary.tripId) {
    try {
      const tripRaw = await apiGet(`/api/trip/${itinerary.tripId}`)
      const trip = TripSchema.parse(tripRaw)
      tripName = trip.destination ?? "Trip"
      tripDateFrom = trip.dateFrom ?? null
      tripDateTo = trip.dateTo ?? null
      tripState = trip.state ?? null

      const session = await getSession()
      const membership = deriveMembership(trip, session)
      isLeader = membership.isLeader
      isTripMember = membership.isMember
      showNavigate = membership.isMember && tripState === TRIP_STATE.HAPPENING
    } catch (error) {
      rethrowIfRedirect(error)
      // fall back to defaults
    }
  }

  return (
    <>
      {isTripMember && itinerary.tripId && <TripChangesListener tripId={itinerary.tripId} />}
      <MapBuilder
        itinerary={itinerary}
        tripId={itinerary.tripId ?? null}
        tripName={tripName}
        tripDateFrom={tripDateFrom}
        tripDateTo={tripDateTo}
        tripState={tripState}
        isLeader={isLeader}
        showNavigate={showNavigate}
        initialDistanceUnit={initialDistanceUnit}
      />
    </>
  )
}
