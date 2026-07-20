import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { LogisticsSchema } from "@/lib/dtos/logistics"
import { TravelDocumentSchema } from "@/lib/dtos/travel-document"
import { ShuttleVehicleSchema } from "@/lib/dtos/shuttle-vehicle"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { LogisticsTab } from "@/components/trips/tabs/logistics-tab"

export default async function TripLogisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isLeader, isMember, currentMemberId, leaderId } = deriveMembership(trip, session)
  const today = new Date().toISOString().slice(0, 10)

  const [logisticsResult, documentsResult, vehiclesResult] = await Promise.allSettled([
    apiGet(`/api/logistics/${id}`)
      .then((raw) => LogisticsSchema.parse(raw))
      .catch(() => null),
    apiGet(`/api/travel-document/${id}/all`)
      .then((raw) => (raw as unknown[]).map((d) => TravelDocumentSchema.parse(d)))
      .catch(() => []),
    apiGet(`/api/shuttle/${id}/all`)
      .then((raw) => (raw as unknown[]).map((v) => ShuttleVehicleSchema.parse(v)))
      .catch(() => []),
  ])
  const logistics = logisticsResult.status === "fulfilled" ? logisticsResult.value : null
  const travelDocuments = documentsResult.status === "fulfilled" ? documentsResult.value : []
  const shuttleVehicles = vehiclesResult.status === "fulfilled" ? vehiclesResult.value : []

  return (
    <LogisticsTab
      tripId={id}
      logistics={logistics}
      travelDocuments={travelDocuments}
      shuttleVehicles={shuttleVehicles}
      members={trip.travellers ?? []}
      today={today}
      isLeader={isLeader}
      isMember={isMember}
      currentMemberId={currentMemberId}
      currentUserId={session?.userId}
      leaderId={leaderId}
    />
  )
}
