"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateTrip } from "@/lib/trips/actions"
import { addDaysIso } from "@/lib/itinerary/format"
import { formatDayDate } from "@/lib/utils/date"

interface ExtendTripRangeFooterProps {
  tripId: string
  /** "max" pushes dateTo forward (a day needs a later date); "min" pulls
   * dateFrom back (a day needs an earlier date). */
  direction: "min" | "max"
  /** ISO date (YYYY-MM-DD) — the trip's current dateTo (max) or dateFrom (min). */
  currentBound: string
}

const EXTEND_BY_DAYS = 7

// Rendered inside a bounded day-date DatePicker's popover (via its `footer`
// slot) when the trip's own dateFrom/dateTo is the thing constraining the
// calendar — the counterpart to bounding the picker in the first place
// (M12 trip-date validation gap): blocking a Day from drifting outside the
// trip's range needs a quick way out, not just a dead end. Pushes the bound
// by a week per click rather than asking the user to name an exact date
// they can't yet select.
export function ExtendTripRangeFooter({
  tripId,
  direction,
  currentBound,
}: ExtendTripRangeFooterProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const extendedDate = addDaysIso(
    currentBound,
    direction === "max" ? EXTEND_BY_DAYS : -EXTEND_BY_DAYS,
  )

  function handleExtend() {
    startTransition(async () => {
      const result = await updateTrip(
        tripId,
        direction === "max" ? { dateTo: extendedDate } : { dateFrom: extendedDate },
      )
      if (result.success) router.refresh()
    })
  }

  return (
    <div className="border-t px-3 py-2">
      <p className="text-muted-foreground text-xs">
        Need {direction === "max" ? "a later" : "an earlier"} date?
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={handleExtend}
        className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
      >
        Extend trip to {formatDayDate(extendedDate)}
      </button>
    </div>
  )
}
