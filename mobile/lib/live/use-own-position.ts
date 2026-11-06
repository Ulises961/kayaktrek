import * as Location from "expo-location"
import { useEffect, useState } from "react"

export type OwnPosition = { latitude: number; longitude: number; accuracyM: number | null }

type Reading = OwnPosition | null

// Where this phone is, from its own fixes, for the "you" marker on the map. A foreground watch that
// lives only while `enabled`; it never asks for the permission (starting a share does, and a map
// must not surprise anyone with a prompt), so without it there is simply no marker. It is a second,
// short-lived location request beside the sharing service, not the service's own fixes.
export function useOwnPosition(enabled: boolean): OwnPosition | null {
  const [position, setPosition] = useState<Reading>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let subscription: Location.LocationSubscription | null = null

    async function watch() {
      try {
        const permission = await Location.getForegroundPermissionsAsync()
        if (cancelled || permission.status !== "granted") return
        const started = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 5 },
          (fix) =>
            setPosition({
              latitude: fix.coords.latitude,
              longitude: fix.coords.longitude,
              accuracyM: fix.coords.accuracy,
            }),
        )
        if (cancelled) started.remove()
        else subscription = started
      } catch {
        // Location off or unavailable: no marker, and nothing to tell the paddler from a map.
      }
    }
    void watch()

    return () => {
      cancelled = true
      subscription?.remove()
      setPosition(null)
    }
  }, [enabled])

  return enabled ? position : null
}
