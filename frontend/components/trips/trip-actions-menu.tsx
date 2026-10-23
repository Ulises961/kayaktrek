"use client"

import { useState } from "react"
import {
  EllipsisIcon,
  FlagIcon,
  LogOutIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AdvanceStateDialog, nextStateStep } from "@/components/trips/advance-state-dialog"
import { EditTripDialog } from "@/components/trips/edit-trip-dialog"
import { PauseTripDialog } from "@/components/trips/pause-controls"
import { LeaveTripDialog } from "@/components/trips/leave-trip-dialog"
import { DeleteTripDialog } from "@/components/trips/delete-trip-dialog"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"

type MenuDialog = "advance" | "edit" | "pause" | "leave" | "delete"

interface TripActionsMenuProps {
  trip: Trip
  isLeader: boolean
  isMember: boolean
}

// Everything you can do to a trip, folded behind one trigger so the header stays about the
// trip. Each item opens a dialog this component owns: a dialog rendered inside a menu item
// would unmount with the menu the moment the item is chosen.
export function TripActionsMenu({ trip, isLeader, isMember }: TripActionsMenuProps) {
  const [dialog, setDialog] = useState<MenuDialog | null>(null)
  const tripId = trip.id!
  const nextStep = isLeader ? nextStateStep(trip.state) : null
  const canPause = isLeader && trip.state === TRIP_STATE.HAPPENING && !trip.isPaused
  // Three groups, in this order: where the trip goes next, editing it, and ending one's part
  // in it. Everyone but the leader has Leave alone.
  const hasStateItems = !!nextStep || canPause
  const hasEditItems = isLeader
  const hasExitItems = isMember || isLeader

  if (!hasStateItems && !hasEditItems && !hasExitItems) return null

  function closeDialog(open: boolean) {
    if (!open) setDialog(null)
  }

  return (
    <>
      {/* Non-modal: a modal menu leaves the page unclickable behind the dialog it opens. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Trip actions"
            className="touch-target size-7 shrink-0"
          >
            <EllipsisIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {nextStep && (
            <DropdownMenuItem onSelect={() => setDialog("advance")}>
              {nextStep.state === TRIP_STATE.HAPPENING ? <PlayIcon /> : <FlagIcon />}
              {nextStep.label}
            </DropdownMenuItem>
          )}
          {canPause && (
            <DropdownMenuItem onSelect={() => setDialog("pause")}>
              <PauseIcon />
              Pause expedition
            </DropdownMenuItem>
          )}
          {hasStateItems && (hasEditItems || hasExitItems) && <DropdownMenuSeparator />}

          {isLeader && (
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <PencilIcon />
              Edit trip
            </DropdownMenuItem>
          )}
          {hasEditItems && hasExitItems && <DropdownMenuSeparator />}

          {isMember && (
            <DropdownMenuItem onSelect={() => setDialog("leave")}>
              <LogOutIcon />
              Leave trip
            </DropdownMenuItem>
          )}
          {isLeader && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
              <Trash2Icon />
              Delete trip
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {nextStep && trip.state && (
        <AdvanceStateDialog
          tripId={tripId}
          currentState={trip.state}
          open={dialog === "advance"}
          onOpenChange={closeDialog}
        />
      )}
      {isLeader && (
        <EditTripDialog trip={trip} open={dialog === "edit"} onOpenChange={closeDialog} />
      )}
      {isLeader && (
        <PauseTripDialog tripId={tripId} open={dialog === "pause"} onOpenChange={closeDialog} />
      )}
      {isMember && (
        <LeaveTripDialog
          tripId={tripId}
          isLeader={isLeader}
          soleMember={(trip.travellers ?? []).length <= 1}
          open={dialog === "leave"}
          onOpenChange={closeDialog}
        />
      )}
      {isLeader && (
        <DeleteTripDialog
          tripId={tripId}
          destination={trip.destination}
          open={dialog === "delete"}
          onOpenChange={closeDialog}
        />
      )}
    </>
  )
}
