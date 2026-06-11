import { UserAvatar } from "@/components/common/user-avatar"
import { RemoveMemberButton } from "@/components/trips/remove-member-button"
import { cn } from "@/lib/utils"
import type { TripMember } from "@/lib/dtos/trip-member"

const roleStyles: Record<"leader" | "crew", string> = {
  leader: "bg-primary/10 text-primary border border-primary/20",
  crew: "bg-secondary text-secondary-foreground border border-border",
}

const roleLabel: Record<"leader" | "crew", string> = {
  leader: "Leader",
  crew: "Crew",
}

interface CrewListProps {
  members: TripMember[]
  tripId?: string
  isLeader?: boolean
  leaderId?: string
}

export function CrewList({ members, tripId, isLeader, leaderId }: CrewListProps) {
  if (members.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => {
        const { user, role } = member
        const displayName = [user.name, user.surname].filter(Boolean).join(" ")
        const canRemove = isLeader && tripId && user.id && user.id !== leaderId

        return (
          <li key={member.id} className="flex items-center gap-3">
            <UserAvatar name={user.name} surname={user.surname} size="md" />
            <span className="flex-1 text-sm font-medium">{displayName}</span>
            <span
              className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", roleStyles[role])}
            >
              {roleLabel[role]}
            </span>
            {canRemove && (
              <RemoveMemberButton tripId={tripId} userId={user.id!} displayName={displayName} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
