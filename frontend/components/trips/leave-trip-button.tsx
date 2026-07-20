"use client"

import { useTransition } from "react"
import { LogOutIcon } from "lucide-react"
import { leaveTrip } from "@/lib/trips/actions"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface LeaveTripButtonProps {
  tripId: string
  isLeader: boolean
  soleMember: boolean
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

export function LeaveTripButton({ tripId, isLeader, soleMember }: LeaveTripButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await leaveTrip(tripId)
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending} className="w-fit">
          <LogOutIcon className="size-3.5" />
          Leave trip
        </Button>
      </AlertDialogTrigger>
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
