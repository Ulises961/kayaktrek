"use client"

import { UsersIcon } from "lucide-react"
import { CrewList } from "@/components/common/crew-list"
import { ListRow } from "@/components/common/list-row"
import { SectionLabel } from "@/components/common/section-label"
import { UserAvatar } from "@/components/common/user-avatar"
import { InviteBuddyPicker } from "@/components/trips/invite-buddy-picker"
import { CancelInvitationButton } from "@/components/trips/cancel-invitation-button"
import type { Trip } from "@/lib/dtos/trip"
import { EmptyState } from "@/components/common/empty-state"

interface CrewTabProps {
  tripId: string
  trip: Trip
  isLeader: boolean
  leaderId?: string
}

export function CrewTab({ tripId, trip, isLeader, leaderId }: CrewTabProps) {
  const travellers = trip.travellers ?? []
  const pendingTravellers = trip.pendingTravellers ?? []

  return (
    <div className="divide-border divide-y">
      <div className="pb-5">
        <SectionLabel className="mb-3">
          <UsersIcon className="-mt-px mr-1 inline size-3" />
          Crew ({travellers.length})
        </SectionLabel>
        {travellers.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No crew yet"
            description="Paddlers who accept an invitation appear here with their vessel and emergency contact."
            ghostRows={2}
          />
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
        <div className="flex flex-col gap-3 py-5">
          <SectionLabel className="mb-3">Invite member</SectionLabel>
          {leaderId && (
            <InviteBuddyPicker
              tripId={tripId}
              currentUserId={leaderId}
              excludeUserIds={[
                ...travellers.map((m) => m.user.id).filter((id): id is string => Boolean(id)),
                ...pendingTravellers.map((u) => u.id).filter((id): id is string => Boolean(id)),
              ]}
            />
          )}
        </div>
      )}

      {isLeader && (
        <div className="pt-5">
          <SectionLabel className="mb-3">
            Pending invitations
            {pendingTravellers.length > 0 && ` (${pendingTravellers.length})`}
          </SectionLabel>
          {pendingTravellers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending invitations.</p>
          ) : (
            <ul className="flex flex-col">
              {pendingTravellers.map((user) => (
                <ListRow key={user.id} className="flex items-center gap-3 py-2">
                  <UserAvatar name={user.name} surname={user.surname} size="md" />
                  <span className="flex-1 text-sm font-medium">
                    {[user.name, user.surname].filter(Boolean).join(" ")}
                  </span>
                  <CancelInvitationButton tripId={tripId} inviteeId={user.id!} />
                </ListRow>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
