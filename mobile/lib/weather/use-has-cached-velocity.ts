import { useEffect, useState } from "react"

import { hasCachedVelocity } from "../db/velocity-cache"

// Whether the last pull saved this day's wind and swell on the phone: `null` while checking, so
// the overlay does not offer a layer offline before it knows it can draw it. Remembers which day
// its answer is for, so a day's answer is never shown for the next.
export function useHasCachedVelocity(dayId: string | null): boolean | null {
  const [answer, setAnswer] = useState<{ dayId: string; saved: boolean } | null>(null)

  useEffect(() => {
    if (dayId === null) return
    let cancelled = false
    hasCachedVelocity(dayId).then(
      (saved) => {
        if (!cancelled) setAnswer({ dayId, saved })
      },
      () => {
        if (!cancelled) setAnswer({ dayId, saved: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [dayId])

  if (dayId === null) return false
  return answer?.dayId === dayId ? answer.saved : null
}
