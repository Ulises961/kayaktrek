"use client"

import { useState } from "react"
import { NewspaperIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { LogForm } from "@/components/logs/log-form"
import type { DistanceUnit } from "@/lib/itinerary/distance"

export function AddLogDialog({ unit }: { unit?: DistanceUnit }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={ctaButtonClass}>
          <PlusIcon className="size-4" />
          New log
        </Button>
      </DialogTrigger>
      <AccentDialogContent icon={NewspaperIcon} title="New log">
        <LogForm unit={unit} onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </AccentDialogContent>
    </Dialog>
  )
}
