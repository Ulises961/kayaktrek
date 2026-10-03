"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTripChanges } from "@/hooks/use-trip-changes"
import { getChangesStreamUrl } from "@/lib/live/actions"

export const TRIP_CHANGES_REFRESH_DEBOUNCE_MS = 250

type TripChangesListenerProps = {
  tripId: string
}

// Keeps a trip's pages current when another crew member or device changes it. Renders
// nothing: a change event only says *that* something changed, so the reaction is to
// re-render the server components through their normal reads. Client state, including a
// form someone is part-way through, survives a refresh.
export function TripChangesListener({ tripId }: TripChangesListenerProps) {
  const router = useRouter()
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A coalesced burst, or several quick commits, becomes one refresh.
  const onChange = useCallback(() => {
    if (pendingRefresh.current) clearTimeout(pendingRefresh.current)
    pendingRefresh.current = setTimeout(() => {
      pendingRefresh.current = null
      router.refresh()
    }, TRIP_CHANGES_REFRESH_DEBOUNCE_MS)
  }, [router])

  useEffect(
    () => () => {
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current)
    },
    [],
  )

  const mintUrl = useCallback(() => getChangesStreamUrl(tripId), [tripId])
  useTripChanges(tripId, { mintUrl, onChange })

  return null
}
