"use client"

import { useState } from "react"
import { EllipsisIcon, LogOutIcon, PauseIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EditTripDialog } from "@/components/trips/edit-trip-dialog"
import { PauseTripDialog } from "@/components/trips/pause-controls"
import { LeaveTripDialog } from "@/components/trips/leave-trip-dialog"
import { DeleteTripDialog } from "@/components/trips/delete-trip-dialog"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"

type MenuDialog = "edit" | "pause" | "leave" | "delete"

interface TripActionsMenuProps {
  trip: Trip
  isLeader: boolean
  isMember: boolean
}

// The occasional things you can do to a trip, folded behind one trigger so the header stays
// about the trip. Each item opens a dialog this component owns: a dialog rendered inside a
// menu item would unmount with the menu the moment the item is chosen.
export function TripActionsMenu({ trip, isLeader, isMember }: TripActionsMenuProps) {
  const [dialog, setDialog] = useState<MenuDialog | null>(null)
  const tripId = trip.id!
  const canPause = isLeader && trip.state === TRIP_STATE.HAPPENING && !trip.isPaused
  // The leader's two groups: Edit and Pause manage the trip; Leave and Delete end one's part
  // in it. Everyone else has Leave alone.
  const hasManageItems = isLeader
  const hasExitItems = isMember || isLeader

  if (!hasManageItems && !hasExitItems) return null

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
          {isLeader && (
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <PencilIcon />
              Edit trip
            </DropdownMenuItem>
          )}
          {canPause && (
            <DropdownMenuItem onSelect={() => setDialog("pause")}>
              <PauseIcon />
              Pause expedition
            </DropdownMenuItem>
          )}
          {hasManageItems && hasExitItems && <DropdownMenuSeparator />}

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
