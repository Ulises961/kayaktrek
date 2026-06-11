"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { advanceState } from "@/lib/trips/actions"
import type { TripState } from "@/lib/dtos/trip"
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

const TRANSITIONS: Record<
  TripState,
  { state: TripState; label: string; description: string } | null
> = {
  building: {
    state: "happening",
    label: "Begin expedition",
    description: "The expedition is now underway. This cannot be undone.",
  },
  happening: {
    state: "past",
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
          variant="outline"
          size="sm"
          disabled={isPending}
          className="w-full sm:w-auto sm:self-start"
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
