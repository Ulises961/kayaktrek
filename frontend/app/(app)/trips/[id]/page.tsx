import { notFound } from "next/navigation"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { getMe } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { ItineraryTab } from "@/components/trips/tabs/itinerary-tab"

export default async function TripItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isLeader } = deriveMembership(trip, session)
  const me = await getMe()

  return (
    <ItineraryTab
      tripId={id}
      itinerary={trip.itinerary}
      isLeader={isLeader}
      tripName={trip.destination ?? ""}
      dateFrom={trip.dateFrom}
      dateTo={trip.dateTo}
      unit={me?.unitPreference ?? DISTANCE_UNIT.NM}
    />
  )
}
