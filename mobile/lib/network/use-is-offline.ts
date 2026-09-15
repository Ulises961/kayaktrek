import { useEffect, useState } from "react"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"

// Drives the persistent offline banner (components/ui/offline-banner.tsx) — reflects
// live device connectivity, not a single request's outcome, so it stays true for as
// long as the device is actually offline rather than clearing after one retry.
// `isConnected` is `null` before NetInfo resolves its first snapshot; treated as
// online so the banner never flashes on cold start.
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    return NetInfo.addEventListener((state: NetInfoState) => {
      setIsOffline(state.isConnected === false)
    })
  }, [])

  return isOffline
}
