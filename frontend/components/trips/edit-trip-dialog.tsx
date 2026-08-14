"use client"

import { KayakIcon } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { EditTripForm } from "@/components/trips/edit-trip-form"
import type { Trip } from "@/lib/dtos/trip"

interface EditTripDialogProps {
  trip: Trip
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditTripDialog({ trip, open, onOpenChange }: EditTripDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AccentDialogContent icon={KayakIcon} title="Edit trip">
        <EditTripForm
          trip={trip}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
