"use client"

import { useState, useTransition } from "react"
import { CalendarCheckIcon } from "lucide-react"
import { closeDay } from "@/lib/live/actions"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface CloseDayButtonProps {
  tripId: string
}

export function CloseDayButton({ tripId }: CloseDayButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function handleConfirm() {
    startTransition(async () => {
      const result = await closeDay(tripId)
      setMessage(result.success ? "Day closed — logs are being generated" : result.error)
      setTimeout(() => setMessage(null), 4000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            className="rounded-full shadow"
          >
            <CalendarCheckIcon className="size-3.5" />
            {/* Icon-only on a phone so the status chip, this and the Annotate FAB
                share one row over a ~311px map. `sr-only`, not `hidden`: this
                triggers an irreversible action and must keep its name. */}
            <span className="sr-only sm:not-sr-only">Close day</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close today&apos;s day?</AlertDialogTitle>
            <AlertDialogDescription>
              Generates an expedition log for every crew member from today&apos;s shared positions.
              Everyone can still fill in the details afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              Close day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && (
        <div className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold shadow">
          {message}
        </div>
      )}
    </div>
  )
}
