import * as Location from "expo-location"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { AppState } from "react-native"

import { SharingStartError, startSharing, stopSharing } from "./position-engine"
import { sharingStatus, type SharingStatus } from "./sharing-status"
import { getSharingRecord, subscribeSharing } from "./sharing-state"
import { POSITION_TASK, STOP_REASON } from "./types"

const REFRESH_MS = 10_000

type SystemFacts = {
  permissionGranted: boolean | null
  locationServicesOn: boolean | null
  taskRunning: boolean | null
}

const UNKNOWN: SystemFacts = { permissionGranted: null, locationServicesOn: null, taskRunning: null }

async function readSystemFacts(taskName: string): Promise<SystemFacts> {
  try {
    const [permission, servicesOn, taskRunning] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
      Location.hasStartedLocationUpdatesAsync(taskName),
    ])
    return { permissionGranted: permission.status === "granted", locationServicesOn: servicesOn, taskRunning }
  } catch {
    return UNKNOWN
  }
}

// What the Share-my-position card shows and does for one trip. The persisted record is the source of
// truth; the phone's own state (app permission, the system location switch, whether the service is
// registered) is read on mount, whenever the app returns to the foreground, and every ten seconds.
export function useSharing(tripId: string): {
  status: SharingStatus
  now: number
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
} {
  const stored = useSyncExternalStore(subscribeSharing, getSharingRecord)
  const record = stored !== null && stored.target.kind === "trip" && stored.target.tripId === tripId ? stored : null
  const [facts, setFacts] = useState<SystemFacts>(UNKNOWN)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setFacts(await readSystemFacts(POSITION_TASK))
    setNow(Date.now())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set inside refresh's async body
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh()
    })
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [refresh])

  const start = useCallback(async () => {
    setError(null)
    try {
      await startSharing({ kind: "trip", tripId })
    } catch (caught) {
      setError(caught instanceof SharingStartError ? caught.message : "Sharing could not be started.")
    }
    await refresh()
  }, [tripId, refresh])

  const stop = useCallback(async () => {
    setError(null)
    await stopSharing(STOP_REASON.USER)
    await refresh()
  }, [refresh])

  return { status: sharingStatus({ record, ...facts, now }), now, error, start, stop }
}
