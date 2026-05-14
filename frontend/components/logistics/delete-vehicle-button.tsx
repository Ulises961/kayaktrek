"use client"

import { useTransition } from "react"
import { Trash2Icon } from "lucide-react"
import { deleteShuttleVehicle } from "@/lib/shuttle/actions"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteVehicleButtonProps {
  tripId: string
  vehicleId: string
  vehicleDescription: string | null | undefined
}

export function DeleteVehicleButton({ tripId, vehicleId, vehicleDescription }: DeleteVehicleButtonProps) {
  const [isPending, startTransition] = useTransition()
  const label = vehicleDescription ?? "this vehicle"

  function handleConfirm() {
    startTransition(async () => {
      await deleteShuttleVehicle(tripId, vehicleId)
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={isPending}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the vehicle and all its passenger assignments.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
