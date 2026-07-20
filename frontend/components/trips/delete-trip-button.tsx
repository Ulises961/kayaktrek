"use client"

import { useTransition } from "react"
import { Trash2Icon } from "lucide-react"
import { deleteTripForEveryone } from "@/lib/trips/actions"
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

interface DeleteTripButtonProps {
  tripId: string
  destination: string | null | undefined
}

export function DeleteTripButton({ tripId, destination }: DeleteTripButtonProps) {
  const [isPending, startTransition] = useTransition()
  const label = destination ?? "this trip"

  function handleConfirm() {
    startTransition(async () => {
      await deleteTripForEveryone(tripId)
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete trip"
          className="text-muted-foreground hover:text-destructive size-7 shrink-0"
          disabled={isPending}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
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
