"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { advanceState } from "@/lib/trips/actions"
import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"
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

interface StateStep {
  state: TripState
  label: string
  description: string
}

const TRANSITIONS: Record<TripState, StateStep | null> = {
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

/** The step that follows `currentState`, or null once the trip is past. */
export function nextStateStep(currentState: TripState | null | undefined): StateStep | null {
  return currentState ? TRANSITIONS[currentState] : null
}

interface AdvanceStateDialogProps {
  tripId: string
  currentState: TripState
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Opened from the trip menu, which owns `open`.
export function AdvanceStateDialog({
  tripId,
  currentState,
  open,
  onOpenChange,
}: AdvanceStateDialogProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const next = nextStateStep(currentState)

  if (!next) return null

  function handleConfirm() {
    startTransition(async () => {
      await advanceState(tripId, next!.state)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
