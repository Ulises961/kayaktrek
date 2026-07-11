import { notFound } from "next/navigation"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { CrewTab } from "@/components/trips/tabs/crew-tab"

export default async function TripCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isLeader, leaderId } = deriveMembership(trip, session)

  return <CrewTab tripId={id} trip={trip} isLeader={isLeader} leaderId={leaderId} />
}
