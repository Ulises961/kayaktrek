"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PauseIcon, PlayIcon, OctagonXIcon } from "lucide-react"
import { toast } from "sonner"
import { pauseTrip, resumeTrip, abortTrip } from "@/lib/trips/actions"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { formatDayDate } from "@/lib/utils/date"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
import { Dialog, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { DatePicker } from "@/components/common/date-picker"

interface PauseControlsProps {
  trip: Trip
  isLeader: boolean
}

export function PauseControls({ trip, isLeader }: PauseControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [resumeOpen, setResumeOpen] = useState(false)
  const [resumeDate, setResumeDate] = useState("")

  if (!isLeader || trip.state !== TRIP_STATE.HAPPENING) return null

  function handlePause() {
    startTransition(async () => {
      const result = await pauseTrip(trip.id!)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleResume() {
    startTransition(async () => {
      const result = await resumeTrip(trip.id!, resumeDate || undefined)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setResumeOpen(false)
      router.refresh()
    })
  }

  function handleAbort() {
    startTransition(async () => {
      const result = await abortTrip(trip.id!)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  if (!trip.isPaused) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            className="w-full sm:w-auto sm:self-start"
          >
            <PauseIcon className="size-3.5" />
            Pause expedition
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause expedition?</AlertDialogTitle>
            <AlertDialogDescription>
              Checkpoint alerts pause until you resume. Resuming shifts the remaining days forward
              by however long the pause lasted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePause} disabled={isPending}>
              Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-notice-border bg-notice-bg text-notice-ink rounded-md border px-3 py-2 text-sm font-medium">
        Expedition paused since {formatDayDate(trip.pausedAt)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending} className="w-fit">
              <PlayIcon className="size-3.5" />
              Resume
            </Button>
          </DialogTrigger>
          <AccentDialogContent icon={PlayIcon} title="Resume expedition">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="resumeDate">Resume date</Label>
                <DatePicker
                  id="resumeDate"
                  value={resumeDate}
                  onChange={setResumeDate}
                  minDate={trip.pausedAt ?? undefined}
                  disabled={isPending}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Remaining days shift forward to match the gap since the pause.
              </p>
              <DialogFooter>
                <Button onClick={handleResume} disabled={isPending}>
                  Resume
                </Button>
              </DialogFooter>
            </div>
          </AccentDialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive w-fit"
            >
              <OctagonXIcon className="size-3.5" />
              Abort expedition
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Abort expedition?</AlertDialogTitle>
              <AlertDialogDescription>
                The trip ends now, marked as interrupted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleAbort}
                disabled={isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                Abort
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
