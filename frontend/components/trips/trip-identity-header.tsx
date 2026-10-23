"use client"

import Link from "next/link"
import { UsersIcon } from "lucide-react"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { PauseControls } from "@/components/trips/pause-controls"
import { TripActionsMenu } from "@/components/trips/trip-actions-menu"
import { LeaderlessTripBanner } from "@/components/trips/leaderless-trip-banner"
import { daysBetween, formatDateRange, tripDayLabel } from "@/lib/trips/format"
import type { Membership } from "@/lib/trips/membership"
import { DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"
import type { Trip } from "@/lib/dtos/trip"
import { PageHeading } from "@/components/common/page-heading"

const MAX_VISIBLE_AVATARS = 5

interface TripIdentityHeaderProps {
  trip: Trip
  membership: Membership
  /** Today's ISO date, passed in so the server and the browser render the same day label. */
  today: string
}

// Who the trip is and where it stands. Everything you can do to it, including moving it to
// its next state, sits behind the actions menu, so the tabs start right under this block.
export function TripIdentityHeader({ trip, membership, today }: TripIdentityHeaderProps) {
  const { isLeader, isMember, currentMemberId } = membership
  const travellers = trip.travellers ?? []
  const days = trip.dateFrom && trip.dateTo ? daysBetween(trip.dateFrom, trip.dateTo) : null
  const dayLabel = tripDayLabel(trip, today)
  const visibleTravellers = travellers.slice(0, MAX_VISIBLE_AVATARS)
  const overflowCount = travellers.length - visibleTravellers.length

  return (
    <div className="flex flex-col gap-2">
      <LeaderlessTripBanner
        tripId={trip.id!}
        tripState={trip.state}
        travellers={travellers}
        isMember={isMember}
        currentMemberId={currentMemberId}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <PageHeading className="min-w-0 truncate">
            {trip.destination ?? "Untitled trip"}
          </PageHeading>
          {trip.state && <StateBadge state={trip.state} className="shrink-0" />}
          {trip.difficulty && (
            <span className="border-border text-muted-foreground inline-flex shrink-0 items-center rounded-[3px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase">
              {DIFFICULTY_LABELS[trip.difficulty]}
            </span>
          )}
        </div>
        <TripActionsMenu trip={trip} isLeader={isLeader} isMember={isMember} />
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span>
          {formatDateRange(trip.dateFrom, trip.dateTo)}
          {dayLabel ? (
            <span className="text-foreground ml-1.5 text-xs font-medium">{dayLabel}</span>
          ) : (
            days !== null && <span className="ml-1 text-xs">({days} days)</span>
          )}
        </span>
        {travellers.length > 0 && (
          <Link
            href={`/trips/${trip.id}/crew`}
            aria-label={`Crew, ${travellers.length}`}
            className="hover:text-foreground flex items-center gap-1.5 rounded-md"
          >
            <UsersIcon className="size-3.5" />
            <span className="flex -space-x-1.5">
              {visibleTravellers.map((m) => (
                <UserAvatar
                  key={m.id}
                  name={m.user.name}
                  surname={m.user.surname}
                  imageUrl={m.user.avatarUrl}
                  size="sm"
                  className="ring-background ring-2"
                />
              ))}
            </span>
            {overflowCount > 0 && <span className="text-xs">+{overflowCount}</span>}
          </Link>
        )}
      </div>

      <PauseControls trip={trip} isLeader={isLeader} />
    </div>
  )
}
