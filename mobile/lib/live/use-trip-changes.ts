import { useEffect, useRef } from "react"

import { tripChangesHub } from "./trip-changes"

type Options = {
  // Only react to changes in these tables (the wire names in `TripChange.t`). Omit to
  // react to everything. An unknown delta — a reconnect that found the trip had moved on —
  // always reacts, whatever is listed.
  tables?: readonly string[]
}

// Calls `onChange` when another crew member or device changes this trip, after the local
// caches have been refreshed. Pass the screen's own `reload`: it is the same read the screen
// does on focus, so a missed event is repaired by the next focus.
export function useTripChanges(
  tripId: string | undefined,
  onChange: () => void,
  { tables }: Options = {},
) {
  const onChangeRef = useRef(onChange)
  const tablesRef = useRef(tables)
  useEffect(() => {
    onChangeRef.current = onChange
    tablesRef.current = tables
  })

  useEffect(() => {
    if (!tripId) return
    return tripChangesHub.subscribe(tripId, (changes) => {
      const wanted = tablesRef.current
      const relevant =
        !wanted || changes.length === 0 || changes.some((entry) => wanted.includes(entry.t))
      if (relevant) onChangeRef.current()
    })
  }, [tripId])
}
