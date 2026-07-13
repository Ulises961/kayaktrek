import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { TripIdentityHeader } from "@/components/trips/trip-identity-header"
import { TripDetailNav } from "@/components/trips/trip-detail-nav"
import { Card, CardContent } from "@/components/ui/card"

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
  const { isLeader, isMember } = deriveMembership(trip, session)

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <TripIdentityHeader trip={trip} isLeader={isLeader} />
      <TripDetailNav tripId={id} showFloatPlan={isMember} />
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
