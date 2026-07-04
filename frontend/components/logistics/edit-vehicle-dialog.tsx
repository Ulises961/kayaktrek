"use client"

import { useState, useTransition } from "react"
import { CarIcon } from "lucide-react"
import { updateShuttleVehicle } from "@/lib/shuttle/actions"
import { palette } from "@/lib/tokens"
import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { VehicleForm } from "@/components/logistics/vehicle-form"
import type { ShuttleVehicle, ShuttleVehicleFields } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

interface EditVehicleDialogProps {
  tripId: string
  vehicle: ShuttleVehicle
  members: TripMember[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditVehicleDialog({
  tripId,
  vehicle,
  members,
  open,
  onOpenChange,
}: EditVehicleDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(fields: ShuttleVehicleFields) {
    startTransition(async () => {
      const result = await updateShuttleVehicle(tripId, vehicle.id!, fields)
      if (result.success) {
        onOpenChange(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AccentDialogContent accent={palette.ocean500} icon={CarIcon} title="Edit vehicle">
        <VehicleForm
          members={members}
          submitLabel="Save"
          isPending={isPending}
          error={error}
          values={{
            driverId: vehicle.driverId,
            driverName: vehicle.driverName ?? "",
            driverContact: vehicle.driverContact ?? "",
            seatsAvailable: vehicle.seatsAvailable,
            kayakSpots: vehicle.kayakSpots,
            vehicleDescription: vehicle.vehicleDescription ?? "",
            pickupPoint: vehicle.pickupPoint ?? "",
          }}
          onSubmit={handleSubmit}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
