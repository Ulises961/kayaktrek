import { AppState, type AppStateStatus } from "react-native"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"

import { runSweep } from "./sweep"

// docs/mobile/sync-protocol-spec.md's mobile-offline.md battery-cost reasoning
// (M9c plan, WP2): sync on app foreground + reconnect only, never on a
// periodic timer. Also runs once immediately on start — without this, a cold
// cache never populates at all, since the foreground/reconnect listeners only
// fire on a *later* transition, never on the current (already-active,
// already-connected) state.
//
// No longer takes a trip id (M9c WP7). It used to, and lived in the Trip
// Detail hub's effect, which quietly made sync scope an artifact of navigation:
// only the trip whose hub was mounted ever synced, and the route — on its own
// channel, pulled by the Itinerary screen — only populated if that specific tab
// was opened while connected. It now drives a sweep over everything due
// (sweep.ts), and is mounted once at the authenticated app root rather than on
// a screen.
//
// "Periodic" is still declined as a *mechanism*; what replaced it is a
// staleness budget (sync-scope.ts) evaluated on these same two triggers. People
// open this app, so foreground is a serviceable poll proxy at zero cost and
// with no new permissions.
export function startSyncTrigger(sync: () => Promise<void> = runSweep): () => void {
  let inFlight = false
  let wasConnected: boolean | null = null

  function runSync() {
    if (inFlight) return
    inFlight = true
    // Failing offline is the expected case here, not exceptional — this runs
    // unattended on every foreground/reconnect, with no UI waiting on it, so a
    // rejection must never surface as an unhandled promise rejection (which
    // React Native renders as a red-screen crash).
    void sync()
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
      })
  }

  runSync()

  const appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") runSync()
  })

  const unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    if (state.isConnected && wasConnected === false) runSync()
    wasConnected = state.isConnected
  })

  return () => {
    appStateSubscription.remove()
    unsubscribeNetInfo()
  }
}
