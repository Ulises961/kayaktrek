import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { listTripInvitations } from "@/lib/trips/actions"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { InvitationActions } from "@/components/trips/invitation-actions"
import { NoTripsIllustration } from "@/components/illustrations/no-trips"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function InvitationsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const trips = await listTripInvitations(session.userId)

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Invitations</h1>

      {trips.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <NoTripsIllustration className="w-56 opacity-80" />
          <p className="text-muted-foreground text-sm">No pending invitations.</p>
        </div>
      ) : (
        <div className="flex max-w-2xl flex-col gap-3">
          {trips.map((trip) => {
            const leader = trip.travellers?.find((m) => m.role === "leader")
            const leaderName = leader
              ? [leader.user.name, leader.user.surname].filter(Boolean).join(" ")
              : null

            return (
              <Card key={trip.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {trip.destination ?? "Untitled trip"}
                    </CardTitle>
                    {trip.state && <StateBadge state={trip.state} />}
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  {leader && (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <UserAvatar name={leader.user.name} surname={leader.user.surname} size="sm" />
                      <span>Invited by {leaderName}</span>
                    </div>
                  )}
                  <InvitationActions tripId={trip.id!} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
