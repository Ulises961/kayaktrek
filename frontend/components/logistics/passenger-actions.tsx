"use client"

import { useTransition } from "react"
import { LogInIcon, XIcon } from "lucide-react"
import { addShuttlePassenger, removeShuttlePassenger } from "@/lib/shuttle/actions"
import { Button } from "@/components/ui/button"

interface JoinVehicleButtonProps {
  tripId: string
  vehicleId: string
  currentMemberId: string
}

export function JoinVehicleButton({ tripId, vehicleId, currentMemberId }: JoinVehicleButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleJoin() {
    startTransition(async () => {
      await addShuttlePassenger(tripId, vehicleId, currentMemberId)
    })
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleJoin}>
      <LogInIcon className="size-3.5" />
      Join
    </Button>
  )
}

interface RemovePassengerButtonProps {
  tripId: string
  vehicleId: string
  memberId: string
}

export function RemovePassengerButton({ tripId, vehicleId, memberId }: RemovePassengerButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      await removeShuttlePassenger(tripId, vehicleId, memberId)
    })
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="inline-flex items-center justify-center size-4 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
      aria-label="Remove passenger"
    >
      <XIcon className="size-2.5" />
    </button>
  )
}
