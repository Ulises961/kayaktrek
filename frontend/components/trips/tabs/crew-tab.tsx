"use client"

import Link from "next/link"
import { UsersIcon, ClipboardListIcon } from "lucide-react"
import { format } from "date-fns"
import { CrewList } from "@/components/common/crew-list"
import { UserAvatar } from "@/components/common/user-avatar"
import { InviteForm } from "@/components/trips/invite-form"
import { CancelInvitationButton } from "@/components/trips/cancel-invitation-button"
import { Button } from "@/components/ui/button"
import type { Trip } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

interface CrewTabProps {
  tripId: string
  trip: Trip
  isLeader: boolean
  leaderId?: string
  currentMember?: TripMember
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </p>
  )
}

export function CrewTab({ tripId, trip, isLeader, leaderId, currentMember }: CrewTabProps) {
  const travellers = trip.travellers ?? []
  const pendingTravellers = trip.pendingTravellers ?? []

  return (
    <div className="divide-y divide-border">

      <div className="pb-5">
        <SectionLabel>
          <UsersIcon className="inline size-3 mr-1 -mt-px" />
          Crew ({travellers.length})
        </SectionLabel>
        {travellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crew members yet.</p>
        ) : (
          <CrewList
            members={travellers}
            tripId={isLeader ? tripId : undefined}
            isLeader={isLeader}
            leaderId={leaderId}
          />
        )}
      </div>

      {isLeader && (
        <div className="py-5">
          <SectionLabel>Invite member</SectionLabel>
          <InviteForm tripId={tripId} />
        </div>
      )}

      {isLeader && (
        <div className="pt-5">
          <SectionLabel>
            Pending invitations
            {pendingTravellers.length > 0 && ` (${pendingTravellers.length})`}
          </SectionLabel>
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
                  <CancelInvitationButton tripId={tripId} inviteeId={user.id!} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {currentMember && (
        <div className="pt-5">
          <SectionLabel>
            <ClipboardListIcon className="inline size-3 mr-1 -mt-px" />
            My float plan
          </SectionLabel>
          {!currentMember.floatPlanConfirmedAt ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Your float plan for this trip hasn&apos;t been reviewed yet.
              </p>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={`/trips/${tripId}/float-plan/edit`}>Review & confirm</Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Last updated{" "}
                {(() => { try { return format(new Date(currentMember.floatPlanConfirmedAt!), "d MMM yyyy") } catch { return currentMember.floatPlanConfirmedAt } })()}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/trips/${tripId}/float-plan/edit`}>Update</Link>
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
