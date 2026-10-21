"use client"

import { useTransition } from "react"
import { deleteTripForEveryone } from "@/lib/trips/actions"
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

interface DeleteTripDialogProps {
  tripId: string
  destination: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Opened from the trip menu, which owns `open`: a dialog rendered inside a dropdown item
// would unmount with the menu the moment the item is chosen.
export function DeleteTripDialog({
  tripId,
  destination,
  open,
  onOpenChange,
}: DeleteTripDialogProps) {
  const [isPending, startTransition] = useTransition()
  const label = destination ?? "this trip"

  function handleConfirm() {
    startTransition(async () => {
      await deleteTripForEveryone(tripId)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the trip and all its data. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
