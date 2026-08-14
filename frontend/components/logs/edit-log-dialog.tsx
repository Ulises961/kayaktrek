"use client"

import { NewspaperIcon } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { LogForm } from "@/components/logs/log-form"
import type { Log } from "@/lib/dtos/log"
import type { DistanceUnit } from "@/lib/itinerary/distance"

interface EditLogDialogProps {
  log: Log
  unit?: DistanceUnit
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditLogDialog({ log, unit, open, onOpenChange }: EditLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AccentDialogContent icon={NewspaperIcon} title="Edit log">
        <LogForm
          log={log}
          unit={unit}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
