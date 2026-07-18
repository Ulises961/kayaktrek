"use client"

import { useState } from "react"
import { NewspaperIcon, PlusIcon } from "lucide-react"
import { palette } from "@/lib/tokens"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { LogForm } from "@/components/logs/log-form"
import type { DistanceUnit } from "@/lib/itinerary/distance"

export function AddLogDialog({ unit }: { unit?: DistanceUnit }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Add log
        </Button>
      </DialogTrigger>
      <AccentDialogContent accent={palette.foam400} icon={NewspaperIcon} title="Add log">
        <LogForm unit={unit} onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </AccentDialogContent>
    </Dialog>
  )
}
