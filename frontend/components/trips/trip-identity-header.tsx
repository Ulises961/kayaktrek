"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { AnchorIcon, PencilIcon, UsersIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { fieldLabelClass } from "@/components/common/form-field"
import { AdvanceStateButton } from "@/components/trips/advance-state-button"
import { PauseControls } from "@/components/trips/pause-controls"
import { EditTripDialog } from "@/components/trips/edit-trip-dialog"
import { DeleteTripButton } from "@/components/trips/delete-trip-button"
import { LeaveTripButton } from "@/components/trips/leave-trip-button"
import { SuccessorPicker } from "@/components/trips/successor-picker"
import { LeaderlessTripBanner } from "@/components/trips/leaderless-trip-banner"
import { daysBetween, formatDateRange } from "@/lib/trips/format"
import type { Membership } from "@/lib/trips/membership"
import {
  TRIP_STATE,
  TRIP_STATES,
  TRIP_STATE_LABELS,
  TRIP_DIFFICULTY_LABELS,
  type Trip,
  type TripState,
} from "@/lib/dtos/trip"
import { PageHeading } from "@/components/common/page-heading"

const MAX_VISIBLE_AVATARS = 5

function StateTimeline({ currentState }: { currentState: TripState }) {
  const currentIndex = TRIP_STATES.indexOf(currentState)
  return (
    <div className="flex items-start">
      {TRIP_STATES.map((s, i) => (
        <Fragment key={s}>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div
              className={`size-3.5 rounded-full border-2 transition-colors ${
                i === currentIndex
                  ? "bg-primary border-primary"
                  : i < currentIndex
                    ? "bg-primary/30 border-primary/30"
                    : "bg-background border-border"
              }`}
            />
            <span
              className={`text-[10px] leading-none capitalize ${
                i === currentIndex ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {TRIP_STATE_LABELS[s]}
            </span>
          </div>
          {i < TRIP_STATES.length - 1 && (
            <div
              className={`mt-[5px] h-0 min-w-4 flex-1 border-t border-dashed ${
                i < currentIndex ? "border-primary/40" : "border-border"
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

interface TripIdentityHeaderProps {
  trip: Trip
  membership: Membership
}

export function TripIdentityHeader({ trip, membership }: TripIdentityHeaderProps) {
  const { isLeader, isMember, currentMemberId } = membership
  const [editOpen, setEditOpen] = useState(false)
  const travellers = trip.travellers ?? []
  const days = trip.dateFrom && trip.dateTo ? daysBetween(trip.dateFrom, trip.dateTo) : null
  const visibleTravellers = travellers.slice(0, MAX_VISIBLE_AVATARS)
  const overflowCount = travellers.length - visibleTravellers.length

  const canAdvanceState = isLeader && trip.state && trip.state !== TRIP_STATE.PAST
  const hasDetails =
    !!trip.description || !!trip.difficulty || canAdvanceState || isLeader || isMember

  return (
    <div className="flex flex-col gap-2">
      <LeaderlessTripBanner
        tripId={trip.id!}
        tripState={trip.state}
        travellers={travellers}
        isMember={isMember}
        currentMemberId={currentMemberId}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PageHeading className="truncate">{trip.destination ?? "Untitled trip"}</PageHeading>
          {trip.state && <StateBadge state={trip.state} />}
        </div>
        {isLeader && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit trip"
              className="size-7"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <DeleteTripButton tripId={trip.id!} destination={trip.destination} />
          </div>
        )}
      </div>

      {isLeader && <EditTripDialog trip={trip} open={editOpen} onOpenChange={setEditOpen} />}

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
        <span>
          {formatDateRange(trip.dateFrom, trip.dateTo)}
          {days !== null && <span className="ml-1 text-xs">({days} days)</span>}
        </span>
        {travellers.length > 0 && (
          <span className="flex items-center gap-1.5">
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
          </span>
        )}
      </div>

      {/* The next state action stays out here, always visible. It was inside the Details
          accordion, which is collapsed by default — so the single most consequential
          control in the product ("Begin expedition": a plan becomes a live expedition, and
          it cannot be undone) was two clicks deep and invisible until you went looking.
          There is only ever one of these, so it costs a row rather than a block, which is
          what let the accordion be both too bulky open and unnoticeable shut. Everything
          occasional — share, print, abort, the description — stays folded below. */}
      {canAdvanceState && trip.state && (
        <div className="flex flex-col gap-3">
          {/* The timeline travels with the buttons that move it. Splitting them left the
              controls out here and "where the trip is" folded away, so you could advance a
              trip without seeing what you were advancing it from. */}
          <StateTimeline currentState={trip.state} />
          <div className="flex flex-wrap items-center gap-2">
            <AdvanceStateButton tripId={trip.id!} currentState={trip.state} />
            <PauseControls trip={trip} isLeader={isLeader} />
          </div>
        </div>
      )}

      {hasDetails && (
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-none">
            {/* Full width with the chevron pushed to the far end, so the row reads as a
                control rather than a stray word. It was `w-fit` muted text at the same
                weight as the body around it, which made the one way into share, print and
                abort effectively invisible. */}
            {/* `rounded-none` overrides the primitive's `rounded-md`: the radius
                curves the ends of this row's `border-t`, so the rule dividing the
                state controls from Details tapers off instead of meeting both
                edges. */}
            <AccordionTrigger className="text-foreground border-border w-full justify-between rounded-none border-t py-2 text-sm font-semibold hover:no-underline">
              Details
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 pt-1 pb-2">
              {trip.description && (
                <div className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>Description</span>
                  <p className="text-sm">{trip.description}</p>
                </div>
              )}

              {trip.difficulty && (
                <div className="flex flex-col gap-2">
                  <span className={fieldLabelClass}>Difficulty</span>
                  <p className="text-sm">{TRIP_DIFFICULTY_LABELS[trip.difficulty]}</p>
                </div>
              )}

              {isLeader && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <span className={fieldLabelClass}>Share &amp; print</span>
                    <Button variant="outline" size="sm" className="w-fit" asChild>
                      <Link href={`/trips/float-plan/${trip.id}`}>
                        <AnchorIcon className="size-3.5" />
                        Printable float plan
                      </Link>
                    </Button>
                  </div>
                </>
              )}

              {isLeader && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <span className={fieldLabelClass}>Successor</span>
                    <SuccessorPicker tripId={trip.id!} travellers={travellers} />
                  </div>
                </>
              )}

              {isMember && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <span className={fieldLabelClass}>Leave</span>
                    <LeaveTripButton
                      tripId={trip.id!}
                      isLeader={isLeader}
                      soleMember={travellers.length <= 1}
                    />
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
