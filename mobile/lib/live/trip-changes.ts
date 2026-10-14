import { createTripChangesPoller } from "@shared/live/trip-changes-poller"

import { pullRoute } from "../db/route-sync"
import { syncTrip } from "../db/sync"
import { getChangesPollUrl } from "./actions"
import { createTripChangesHub } from "./trip-changes-hub"
import { createStreamingGate } from "./trip-changes-lifecycle"

// Slower than the web's 7 s: every poll wakes the phone's radio, and a paddler in a tent is
// not waiting on a crewmate's edit to the second. Coming to the foreground polls at once.
const POLL_INTERVAL_MS = 10_000

// The app-wide hub. The route travels on its own channel (spec §8.2), so a change pulls both:
// the generic delta for crew/kit/weather and the route wholesale. `pullRoute` leaves a
// route alone while it has the leader's own unsent edits or a parked conflict.
export const tripChangesHub = createTripChangesHub({
  mintUrl: getChangesPollUrl,
  refreshCaches: async (tripId) => {
    await Promise.all([syncTrip(tripId), pullRoute(tripId)])
  },
  createPoller: (options) => createTripChangesPoller({ ...options, intervalMs: POLL_INTERVAL_MS }),
})

// Mounted once at the authenticated app root, beside startSyncTrigger.
export function startTripChanges(): () => void {
  return createStreamingGate(tripChangesHub.setStreaming)
}
