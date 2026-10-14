"use client"

import { useEffect, useRef, useState } from "react"
import type { TripChange } from "@/lib/dtos/trip-change"
import { createTripChangesPoller, type TripChangesStatus } from "@/lib/live/trip-changes-poller"

export type { TripChangesStatus }

type Options = {
  // Mints a fresh ticketed poll URL. `null` means the server refused: the viewer is no longer
  // on the trip. A ticket lives five minutes, so the poller asks again as it ages.
  mintUrl: () => Promise<string | null>
  // Fired when something the viewer may be showing has changed. An empty list means
  // *something* has but the exact changes are unknown.
  onChange: (changes: TripChange[]) => void
  // The revision the page's data was read at, so a change that landed between the read and
  // the first poll is reported. Only read when polling starts.
  initialRev?: number | null
}

// Polls a trip's change log while this tab is in front, and says when someone else changed
// the trip (M36). The protocol lives in `lib/live/trip-changes-poller.ts`; this adds the
// browser: pause while the tab is hidden, and catch up the moment it is shown again.
export function useTripChanges(tripId: string | null, options: Options) {
  const [status, setStatus] = useState<TripChangesStatus>("connecting")
  const mintUrlRef = useRef(options.mintUrl)
  const onChangeRef = useRef(options.onChange)
  const initialRevRef = useRef(options.initialRev)
  useEffect(() => {
    mintUrlRef.current = options.mintUrl
    onChangeRef.current = options.onChange
    initialRevRef.current = options.initialRev
  }, [options.mintUrl, options.onChange, options.initialRev])

  useEffect(() => {
    if (!tripId) return

    const isVisible = () => document.visibilityState === "visible"
    const poller = createTripChangesPoller({
      mintUrl: () => mintUrlRef.current(),
      onChange: (changes) => onChangeRef.current(changes),
      onStatus: setStatus,
      since: initialRevRef.current ?? null,
      startActive: isVisible(),
    })
    const onVisibilityChange = () => poller.setActive(isVisible())
    document.addEventListener("visibilitychange", onVisibilityChange)
    poller.start()

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      poller.stop()
    }
  }, [tripId])

  return { status }
}
