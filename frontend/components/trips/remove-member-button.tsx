"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserMinusIcon } from "lucide-react"
import { removeMember } from "@/lib/trips/actions"
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

interface RemoveMemberButtonProps {
  tripId: string
  userId: string
  displayName: string
}

export function RemoveMemberButton({ tripId, userId, displayName }: RemoveMemberButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    startTransition(async () => {
      await removeMember(tripId, userId)
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* Icon-only below `sm`. The crew row already carries an avatar, a name, a role
            pill and this control; the word was what pushed it past a 320px viewport. The
            accessible name is on the button, so the control is unchanged for a screen
            reader either way. */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${displayName}`}
          className="text-destructive hover:text-destructive max-sm:size-8 max-sm:px-0"
          disabled={isPending}
        >
          <UserMinusIcon className="size-4 sm:hidden" />
          <span className="max-sm:sr-only">Remove</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will lose access to this trip immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
