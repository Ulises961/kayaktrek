import { pullRoute } from "../db/route-sync"
import { syncTrip } from "../db/sync"
import { getChangesStreamUrl } from "./actions"
import { readEventStream } from "./event-stream"
import { createTripChangesHub } from "./trip-changes-hub"
import { createStreamingGate } from "./trip-changes-lifecycle"

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done)
  })
}

// The app-wide hub. The route travels on its own channel (spec §8.2), so a change pulls both:
// the generic delta for crew/kit/weather and the route wholesale. `pullRoute` leaves a
// route alone while it has the leader's own unsent edits or a parked conflict.
export const tripChangesHub = createTripChangesHub({
  mintUrl: getChangesStreamUrl,
  readStream: readEventStream,
  refreshCaches: async (tripId) => {
    await Promise.all([syncTrip(tripId), pullRoute(tripId)])
  },
  wait,
})

// Mounted once at the authenticated app root, beside startSyncTrigger.
export function startTripChanges(): () => void {
  return createStreamingGate(tripChangesHub.setStreaming)
}
