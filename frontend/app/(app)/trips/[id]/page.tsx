import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripSchema } from "@/lib/dtos/trip"
import { StateBadge } from "@/components/common/state-badge"
import { CrewList } from "@/components/common/crew-list"
import { UserAvatar } from "@/components/common/user-avatar"
import { InviteForm } from "@/components/trips/invite-form"
import { CancelInvitationButton } from "@/components/trips/cancel-invitation-button"
import { CalendarIcon, ClockIcon, MapPinIcon, UsersIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function daysBetween(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)
}

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
  const { destination, state, dateFrom, dateTo, description } = trip
  const travellers = trip.travellers ?? []
  const pendingTravellers = trip.pendingTravellers ?? []
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null
  const leader = travellers.find((m) => m.role === "leader")
  const isLeader = !!session && !!leader && leader.user.id === session.userId

  return (
    <div className="flex flex-col gap-6 max-w-2xl">

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{destination ?? "Untitled trip"}</h1>
          {state && <StateBadge state={state} />}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {dateFrom && dateTo ? (
            <>
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="size-4" />
                {dateFrom} — {dateTo}
              </span>
              {days !== null && (
                <span className="flex items-center gap-1.5">
                  <ClockIcon className="size-4" />
                  {days} days
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-4" />
              No dates set
            </span>
          )}
        </div>

        {description && (
          <p className="text-sm text-foreground/80 mt-1">{description}</p>
        )}
      </div>

      {/* Crew */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="size-4" />
            Crew ({travellers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CrewList members={travellers} />
          {travellers.length === 0 && (
            <p className="text-sm text-muted-foreground">No crew members yet.</p>
          )}

          {isLeader && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Invite by user ID
                </p>
                <InviteForm tripId={id} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations — visible to leader only */}
      {isLeader && (pendingTravellers.length > 0 || true) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="size-4" />
              Pending invitations
              {pendingTravellers.length > 0 && (
                <span className="text-muted-foreground font-normal">({pendingTravellers.length})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingTravellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pendingTravellers.map((user) => (
                  <li key={user.id} className="flex items-center gap-3">
                    <UserAvatar name={user.name} surname={user.surname} size="md" />
                    <span className="flex-1 text-sm font-medium">
                      {[user.name, user.surname].filter(Boolean).join(" ")}
                    </span>
                    <CancelInvitationButton tripId={id} inviteeId={user.id!} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Itinerary — M4 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPinIcon className="size-4" />
            Itinerary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Map-first itinerary builder coming in M4.</p>
        </CardContent>
      </Card>

    </div>
  )
}
