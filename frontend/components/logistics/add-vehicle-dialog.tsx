"use client"

import { useState, useTransition } from "react"
import { CarIcon, PlusIcon } from "lucide-react"
import { createShuttleVehicle } from "@/lib/shuttle/actions"
import { palette } from "@/lib/tokens"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { VehicleForm } from "@/components/logistics/vehicle-form"
import type { ShuttleVehicleFields } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

interface AddVehicleDialogProps {
  tripId: string
  members: TripMember[]
}

export function AddVehicleDialog({ tripId, members }: AddVehicleDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) setError(null)
  }

  function handleSubmit(fields: ShuttleVehicleFields) {
    startTransition(async () => {
      const result = await createShuttleVehicle(tripId, fields)
      if (result.success) {
        setOpen(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PlusIcon className="size-3.5" />
          Add vehicle
        </Button>
      </DialogTrigger>
      <AccentDialogContent accent={palette.ocean500} icon={CarIcon} title="Add vehicle">
        <VehicleForm
          members={members}
          submitLabel="Add"
          isPending={isPending}
          error={error}
          onSubmit={handleSubmit}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
