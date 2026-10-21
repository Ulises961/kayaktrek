"use client"

import Link from "next/link"
import { TriangleAlertIcon, UsersIcon } from "lucide-react"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { AdvanceStateButton } from "@/components/trips/advance-state-button"
import { PauseControls } from "@/components/trips/pause-controls"
import { TripActionsMenu } from "@/components/trips/trip-actions-menu"
import { LeaderlessTripBanner } from "@/components/trips/leaderless-trip-banner"
import { daysBetween, formatDateRange, tripDayLabel } from "@/lib/trips/format"
import type { Membership } from "@/lib/trips/membership"
import { satelliteTrackingIsOff } from "@/lib/trips/satellite"
import { DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { PageHeading } from "@/components/common/page-heading"

const MAX_VISIBLE_AVATARS = 5

interface TripIdentityHeaderProps {
  trip: Trip
  membership: Membership
  /** Whether the user has a satellite feed registered in Settings (M29). */
  hasSatelliteFeed: boolean
  /** Today's ISO date, passed in so the server and the browser render the same day label. */
  today: string
}

// Who the trip is and where it stands. Everything occasional sits behind the actions menu,
// so the tabs start right under this block. The next state step stays out here as a button:
// it turns a plan into a live expedition, and a control that consequential must be seen.
export function TripIdentityHeader({
  trip,
  membership,
  hasSatelliteFeed,
  today,
}: TripIdentityHeaderProps) {
  const { isLeader, isMember, currentMember, currentMemberId } = membership
  const travellers = trip.travellers ?? []
  const days = trip.dateFrom && trip.dateTo ? daysBetween(trip.dateFrom, trip.dateTo) : null
  const dayLabel = tripDayLabel(trip, today)
  const visibleTravellers = travellers.slice(0, MAX_VISIBLE_AVATARS)
  const overflowCount = travellers.length - visibleTravellers.length

  const canAdvanceState = isLeader && trip.state && trip.state !== TRIP_STATE.PAST
  const trackingOff = satelliteTrackingIsOff(trip.state, currentMember, hasSatelliteFeed)

  return (
    <div className="flex flex-col gap-2">
      <LeaderlessTripBanner
        tripId={trip.id!}
        tripState={trip.state}
        travellers={travellers}
        isMember={isMember}
        currentMemberId={currentMemberId}
      />
      {/* The advance button takes its own line on a phone and joins the title row from `sm`. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
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
        <div className="order-2 flex items-center">
          <TripActionsMenu trip={trip} isLeader={isLeader} isMember={isMember} />
        </div>
        {canAdvanceState && trip.state && (
          <div className="order-3 w-full sm:order-1 sm:w-auto">
            <AdvanceStateButton tripId={trip.id!} currentState={trip.state} />
          </div>
        )}
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

      {/* A warning is not metadata: it takes a line of its own, and only while it applies. */}
      {trackingOff && (
        <div className="border-notice-border bg-notice-bg text-notice-ink flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            inReach is off, so your position is not being shared.{" "}
            <Link href={`/trips/${trip.id}/my-float-plan`} className="font-medium underline">
              Turn it on
            </Link>
          </p>
        </div>
      )}

      <PauseControls trip={trip} isLeader={isLeader} />
    </div>
  )
}
