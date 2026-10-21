import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { hasRegisteredFeed } from "@/lib/satellite-feeds/registered"
import { liveMapHref } from "@/lib/trips/live"
import { deriveMembership } from "@/lib/trips/membership"
import { canShareSatellitePosition } from "@/lib/trips/satellite"
import { todayIso } from "@/lib/utils/date"
import { TripIdentityHeader } from "@/components/trips/trip-identity-header"
import { TripDetailNav } from "@/components/trips/trip-detail-nav"
import { TripChangesListener } from "@/components/trips/trip-changes-listener"
import { Card, CardContent } from "@/components/ui/card"
import { CardTopRule } from "@/components/common/card-top-rule"
import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"

export default async function TripDetailLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const membership = deriveMembership(trip, session)
  const { isMember } = membership
  // Membership is this layout's to decide; where "live" points is not — liveMapHref owns
  // that, so the Live tab and the dashboard's panel cannot drift to different URLs.
  const liveHref = isMember ? (liveMapHref(trip) ?? undefined) : undefined
  // This layout wraps every tab, so the feed is looked up only for a member who could be
  // sharing: the header warns when a registered feed is not.
  const hasSatelliteFeed =
    canShareSatellitePosition(trip.state, membership.currentMember) && (await hasRegisteredFeed())

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {isMember && <TripChangesListener tripId={id} initialRev={trip.changeRev ?? null} />}
      <SetBreadcrumbs
        crumbs={[
          { label: "Trips", href: "/trips" },
          { label: trip.destination ?? "Untitled trip" },
        ]}
      />
      <TripIdentityHeader
        trip={trip}
        membership={membership}
        hasSatelliteFeed={hasSatelliteFeed}
        today={todayIso()}
      />
      <TripDetailNav tripId={id} showFloatPlan={isMember} liveHref={liveHref} />
      <Card className="relative overflow-hidden">
        <CardTopRule className="absolute inset-x-0 top-0" />
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
