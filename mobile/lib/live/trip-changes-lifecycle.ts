import { AppState, type AppStateStatus } from "react-native"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"

// Whether the trip's change log should be polled: foregrounded and reachable. Backgrounded
// or offline, polling only spends battery on a phone that is usually in a drybag — the
// sweep (lib/db/sync-trigger.ts) catches up on the next foreground or reconnect instead.
//
// `isConnected` is null before NetInfo resolves its first snapshot, treated as reachable
// the way the offline banner does (lib/network/use-is-offline.ts).
export function createStreamingGate(setStreaming: (enabled: boolean) => void): () => void {
  let isActive = AppState.currentState === "active"
  let isReachable = true

  function update() {
    setStreaming(isActive && isReachable)
  }

  const appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    isActive = state === "active"
    update()
  })
  const unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    isReachable = state.isConnected !== false
    update()
  })

  return () => {
    appStateSubscription.remove()
    unsubscribeNetInfo()
  }
}
