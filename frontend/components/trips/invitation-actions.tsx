"use client"

import { useTransition } from "react"
import { handleInvitation } from "@/lib/trips/actions"
import { Button } from "@/components/ui/button"

interface InvitationActionsProps {
  tripId: string
}

export function InvitationActions({ tripId }: InvitationActionsProps) {
  const [isPending, startTransition] = useTransition()

  function respond(accepted: boolean) {
    startTransition(async () => {
      await handleInvitation(tripId, accepted)
    })
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={isPending} onClick={() => respond(true)}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => respond(false)}>
        Decline
      </Button>
    </div>
  )
}
