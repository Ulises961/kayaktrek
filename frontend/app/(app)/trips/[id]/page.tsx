import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripSchema } from "@/lib/dtos/trip"
import { UserSchema } from "@/lib/dtos/user"
import { ItemsSchema } from "@/lib/dtos/item"
import { LogisticsSchema } from "@/lib/dtos/logistics"
import { TravelDocumentSchema } from "@/lib/dtos/travel-document"
import { ShuttleVehicleSchema } from "@/lib/dtos/shuttle-vehicle"
import { TripIdentityCard } from "@/components/trips/trip-identity-card"
import { TripDetailTabs } from "@/components/trips/trip-detail-tabs"
import { Card, CardContent } from "@/components/ui/card"

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let trip
  try {
    const raw = await apiGet(`/api/trip/${id}`)
    trip = TripSchema.parse(raw)
  } catch {
    notFound()
  }

  const session = await getSession()
  const today = new Date().toISOString().slice(0, 10)

  const travellers = trip.travellers ?? []
  const leader = travellers.find((m) => m.role === "leader")
  const isLeader = !!session && !!leader && leader.user.id === session.userId
  const currentMember = session ? travellers.find((m) => m.user.id === session.userId) : undefined
  const isMember = !!currentMember

  const [logisticsResult, documentsResult, vehiclesResult, profileResult, itemsResult] =
    await Promise.allSettled([
      apiGet(`/api/logistics/${id}`)
        .then((raw) => LogisticsSchema.parse(raw))
        .catch(() => null),
      apiGet(`/api/travel-document/${id}/all`)
        .then((raw) => (raw as unknown[]).map((d) => TravelDocumentSchema.parse(d)))
        .catch(() => []),
      apiGet(`/api/shuttle/${id}/all`)
        .then((raw) => (raw as unknown[]).map((v) => ShuttleVehicleSchema.parse(v)))
        .catch(() => []),
      isMember
        ? apiGet("/api/user/me")
            .then((raw) => UserSchema.parse(raw))
            .catch(() => null)
        : Promise.resolve(null),
      isMember
        ? apiGet("/api/item/all")
            .then((raw) => ItemsSchema.parse(raw))
            .catch(() => [])
        : Promise.resolve([]),
    ])
  const logistics = logisticsResult.status === "fulfilled" ? logisticsResult.value : null
  const travelDocuments = documentsResult.status === "fulfilled" ? documentsResult.value : []
  const shuttleVehicles = vehiclesResult.status === "fulfilled" ? vehiclesResult.value : []
  const userProfile = profileResult.status === "fulfilled" ? profileResult.value : null
  const myItems = itemsResult.status === "fulfilled" ? itemsResult.value : []

  // Merge TripMember snapshot with User profile fallback for float plan pre-fill.
  // TripMember data always wins; profile fills gaps (e.g. profile updated after trip creation).
  const mergedCurrentMember =
    currentMember && userProfile
      ? {
          ...currentMember,
          vesselMake: currentMember.vesselMake ?? userProfile.vesselMake,
          vesselModel: currentMember.vesselModel ?? userProfile.vesselModel,
          vesselLengthCm: currentMember.vesselLengthCm ?? userProfile.vesselLengthCm,
          vesselColorPrimary: currentMember.vesselColorPrimary ?? userProfile.vesselColorPrimary,
          vesselColorSecondary:
            currentMember.vesselColorSecondary ?? userProfile.vesselColorSecondary,
          emergencyContactName:
            currentMember.emergencyContactName ?? userProfile.emergencyContactName,
          emergencyContactPhone:
            currentMember.emergencyContactPhone ?? userProfile.emergencyContactPhone,
          emergencyContactRelationship:
            currentMember.emergencyContactRelationship ?? userProfile.emergencyContactRelationship,
        }
      : currentMember

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <TripIdentityCard trip={trip} isLeader={isLeader} />

      <Card>
        <CardContent className="p-0">
          <TripDetailTabs
            tripId={id}
            trip={trip}
            logistics={logistics}
            travelDocuments={travelDocuments}
            shuttleVehicles={shuttleVehicles}
            today={today}
            isLeader={isLeader}
            isMember={isMember}
            currentMember={mergedCurrentMember}
            currentMemberId={currentMember?.id}
            currentUserId={session?.userId}
            leaderId={leader?.user.id}
            medicalNotesResetAt={userProfile?.medicalNotesResetAt ?? null}
            myItems={myItems}
          />
        </CardContent>
      </Card>
    </div>
  )
}
