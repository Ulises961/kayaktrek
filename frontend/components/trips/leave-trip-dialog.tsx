"use client"

import { useTransition } from "react"
import { leaveTrip } from "@/lib/trips/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface LeaveTripDialogProps {
  tripId: string
  isLeader: boolean
  soleMember: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

function leaveDescription(isLeader: boolean, soleMember: boolean): string {
  if (isLeader && soleMember) {
    return "You're the only member — leaving will delete this trip and all its data."
  }
  if (isLeader) {
    return "You're the leader — leaving will make this trip leaderless until a crew member claims it."
  }
  return "You'll lose access to this trip's itinerary, crew, and logistics unless invited back."
}

// Opened from the trip menu, which owns `open`.
export function LeaveTripDialog({
  tripId,
  isLeader,
  soleMember,
  open,
  onOpenChange,
}: LeaveTripDialogProps) {
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await leaveTrip(tripId)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this trip?</AlertDialogTitle>
          <AlertDialogDescription>{leaveDescription(isLeader, soleMember)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            Leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
