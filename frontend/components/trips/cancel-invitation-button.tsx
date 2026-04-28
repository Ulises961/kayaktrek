"use client"

import { useTransition } from "react"
import { cancelInvitation } from "@/lib/trips/actions"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

interface CancelInvitationButtonProps {
  tripId: string
  inviteeId: string
}

export function CancelInvitationButton({ tripId, inviteeId }: CancelInvitationButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await cancelInvitation(tripId, inviteeId)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={handleClick}
      aria-label="Cancel invitation"
    >
      <XIcon className="size-4" />
    </Button>
  )
}
