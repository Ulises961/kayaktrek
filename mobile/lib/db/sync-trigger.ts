import { AppState, type AppStateStatus } from "react-native"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"

import { syncTrip } from "./sync"

// docs/mobile/sync-protocol-spec.md's mobile-offline.md battery-cost reasoning
// (M9c plan, WP2): sync on app foreground + reconnect only, never on a
// periodic timer. Also runs once immediately on start — without this, a
// first-time trip view never populates the local cache at all, since the
// foreground/reconnect listeners only fire on a *later* transition, never on
// the current (already-active, already-connected) state.
export function startSyncTrigger(tripId: string, sync: (tripId: string) => Promise<void> = syncTrip): () => void {
  let inFlight = false
  let wasConnected: boolean | null = null

  function runSync() {
    if (inFlight) return
    inFlight = true
    void sync(tripId).finally(() => {
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
