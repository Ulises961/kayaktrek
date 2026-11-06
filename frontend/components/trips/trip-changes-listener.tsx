"use client"

import { useCallback, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTripChanges } from "@/hooks/use-trip-changes"
import type { TripChange } from "@/lib/dtos/trip-change"
import { getChangesPollUrl } from "@/lib/live/actions"
import { changesAffectPage } from "@/lib/trips/change-relevance"

export const TRIP_CHANGES_REFRESH_DEBOUNCE_MS = 250

// A refresh re-runs the whole layout's reads (the account, connections and invitations calls
// among them), and the backend limits each of those routes to 1000 an hour per user
// (`Api/limiter.py`). Matching the 7 s poll, a page refreshed on every poll for a whole hour
// spends at most ~514 of that budget and leaves the rest for navigating.
export const TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS = 7_000

type TripChangesListenerProps = {
  tripId: string
  // Where the trip's change log stood when this page's data was read.
  initialRev?: number | null
}

// Keeps a trip's pages current when another crew member or device changes it. Shows
// nothing to the viewer: a change says *that* something changed, so the reaction is to
// re-render the server components through their normal reads. Client state, including a
// form someone is part-way through, survives a refresh. A change this page cannot display
// does not refresh it (`changesAffectPage`).
export function TripChangesListener({ tripId, initialRev = null }: TripChangesListenerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRefreshAt = useRef<number | null>(null)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // A coalesced burst, or several quick commits, becomes one refresh; and a refresh never
  // follows the previous one by less than the minimum interval, so whatever changed in
  // between is shown by that one.
  const onChange = useCallback(
    (changes: TripChange[]) => {
      if (!changesAffectPage(pathnameRef.current, changes)) return
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current)
      const sinceLastRefresh =
        lastRefreshAt.current === null ? Infinity : Date.now() - lastRefreshAt.current
      const wait = Math.max(
        TRIP_CHANGES_REFRESH_DEBOUNCE_MS,
        TRIP_CHANGES_MIN_REFRESH_INTERVAL_MS - sinceLastRefresh,
      )
      pendingRefresh.current = setTimeout(() => {
        pendingRefresh.current = null
        lastRefreshAt.current = Date.now()
        router.refresh()
      }, wait)
    },
    [router],
  )

  useEffect(
    () => () => {
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current)
    },
    [],
  )

  const mintUrl = useCallback(() => getChangesPollUrl(tripId), [tripId])
  const { status } = useTripChanges(tripId, { mintUrl, onChange, initialRev })

  // Hidden, but present so the e2e spec can wait for the first poll before it changes
  // anything: a page that has not polled yet has not caught up with what it was rendered at.
  return <span hidden data-trip-changes-status={status} />
}
