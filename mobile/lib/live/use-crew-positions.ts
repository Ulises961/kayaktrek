import { useEffect, useState } from "react"
import { AppState } from "react-native"

import type { LivePosition } from "@shared/dtos/live-position"

import { getPositionsPollUrl } from "./actions"
import { createCrewPositionsPoller } from "./crew-positions-poller"
import { createStreamingGate } from "./trip-changes-lifecycle"

type Crew = { tripId: string; positions: LivePosition[] }

// The newest position of each crew member who has shared one, polled while `enabled` (the trip is
// under way) and the app is in the foreground and reachable. The last answer stays on screen while
// polls fail, so a bad stretch of coverage does not blank the map; it goes only when the poll ends
// because the trip is no longer under way, or when this stops being wanted.
export function useCrewPositions(tripId: string | undefined, enabled: boolean): LivePosition[] {
  const [crew, setCrew] = useState<Crew | null>(null)

  useEffect(() => {
    if (!enabled || !tripId) return
    const poller = createCrewPositionsPoller({
      mintUrl: () => getPositionsPollUrl(tripId),
      onPositions: (positions) => setCrew({ tripId, positions }),
      onStatus: (status) => {
        if (status === "ended") setCrew({ tripId, positions: [] })
      },
      startActive: AppState.currentState === "active",
    })
    const stopGate = createStreamingGate(poller.setActive)
    poller.start()
    return () => {
      stopGate()
      poller.stop()
    }
  }, [tripId, enabled])

  return enabled && crew !== null && crew.tripId === tripId ? crew.positions : []
}
