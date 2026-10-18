import { notFound, redirect } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { listSatelliteFeeds } from "@/lib/satellite-feeds/actions"
import { deriveMembership } from "@/lib/trips/membership"
import { FloatPlanTab } from "@/components/trips/tabs/float-plan-tab"

export default async function TripMyFloatPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { currentMember } = deriveMembership(trip, session)
  if (!currentMember) redirect(`/trips/${id}`)

  const [userProfile, satelliteFeeds] = await Promise.all([
    apiGet("/api/user/me")
      .then((raw) => UserSchema.parse(raw))
      .catch(() => null),
    listSatelliteFeeds(),
  ])

  // TripMember snapshot always wins; profile fills gaps (e.g. profile updated
  // after the trip was created).
  const mergedCurrentMember = userProfile
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
    <FloatPlanTab
      tripId={id}
      tripState={trip.state}
      currentMember={mergedCurrentMember}
      hasSatelliteFeed={satelliteFeeds.length > 0}
      medicalNotesResetAt={userProfile?.medicalNotesResetAt ?? null}
    />
  )
}
