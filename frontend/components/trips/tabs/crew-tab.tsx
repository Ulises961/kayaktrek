"use client"

import { UsersIcon } from "lucide-react"
import { CrewList } from "@/components/common/crew-list"
import { UserAvatar } from "@/components/common/user-avatar"
import { InviteForm } from "@/components/trips/invite-form"
import { CancelInvitationButton } from "@/components/trips/cancel-invitation-button"
import type { Trip } from "@/lib/dtos/trip"

interface CrewTabProps {
  tripId: string
  trip: Trip
  isLeader: boolean
  leaderId?: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </p>
  )
}

export function CrewTab({ tripId, trip, isLeader, leaderId }: CrewTabProps) {
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

    </div>
  )
}
