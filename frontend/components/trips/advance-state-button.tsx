"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { advanceState } from "@/lib/trips/actions"
import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
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

const TRANSITIONS: Record<
  TripState,
  { state: TripState; label: string; description: string } | null
> = {
  building: {
    state: TRIP_STATE.HAPPENING,
    label: "Begin expedition",
    description: "The expedition is now underway. This cannot be undone.",
  },
  happening: {
    state: TRIP_STATE.PAST,
    label: "Mark as past",
    description: "The trip will be marked as completed. This cannot be undone.",
  },
  past: null,
}

interface AdvanceStateButtonProps {
  tripId: string
  currentState: TripState
}

export function AdvanceStateButton({ tripId, currentState }: AdvanceStateButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const next = TRANSITIONS[currentState]
  // Setting out is the forward commitment; closing the trip out is not.
  const isDeparture = next?.state === TRIP_STATE.HAPPENING

  if (!next) return null

  function handleConfirm() {
    startTransition(async () => {
      await advanceState(tripId, next!.state)
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant={isDeparture ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          className={cn(
            "w-full sm:w-auto sm:self-start",
            // Only the forward step is a CTA. "Mark as past" closes a trip out and stays
            // quiet beside it, so the pair reads as start versus finish.
            isDeparture && ctaButtonClass,
          )}
        >
          {next.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{next.label}</AlertDialogTitle>
          <AlertDialogDescription>{next.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
