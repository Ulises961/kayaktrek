import { ViewAnnotation } from "@maplibre/maplibre-react-native"
import { useIsFocused } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"

import { palette } from "@shared/tokens"

import { Text } from "@mobile/components/ui/text"
import { getSession } from "@mobile/lib/auth/session"
import { crewMarkerLabel } from "@mobile/lib/live/crew-position-label"
import { useCrewPositions } from "@mobile/lib/live/use-crew-positions"
import { useOwnPosition } from "@mobile/lib/live/use-own-position"

// How often the ages in the labels are recomputed. They read "N min ago", so a minute's worth of
// drift is invisible and a faster tick would only re-render the map for nothing.
const AGE_TICK_MS = 30_000
const QUIET_OPACITY = 0.45

// The live layer of the itinerary map (M9e WP3): the crew's newest positions, and the paddler's own
// marker from the phone's own fix. Mounts inside the map; `live` is whether the trip is under way,
// which is all it polls and watches for.
export function CrewPositionMarkers({ tripId, live }: { tripId: string; live: boolean }) {
  // A map left behind by another screen pushed over it is not on show, so it neither polls nor watches.
  const focused = useIsFocused()
  const active = live && focused
  const crew = useCrewPositions(tripId, active)
  const ownPosition = useOwnPosition(active)
  // `undefined` until the session has been read: the crew is drawn only once the paddler's own entry
  // can be left out of it, so it never flashes on the map as a second "you".
  const [ownUserId, setOwnUserId] = useState<string | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    void getSession().then((session) => {
      if (!cancelled) setOwnUserId(session?.userId ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(timer)
  }, [active])

  return (
    <>
      {(ownUserId === undefined ? [] : crew)
        .filter((position) => position.userId !== ownUserId)
        .map((position) => {
          const label = crewMarkerLabel(position, now)
          return (
            <ViewAnnotation key={position.userId} id={`crew-${position.userId}`} lngLat={[position.lon, position.lat]}>
              <View style={{ alignItems: "center" }}>
                <View
                  testID={`crew-dot-${position.userId}`}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: palette.foam400,
                    borderWidth: 2,
                    borderColor: palette.ocean900,
                    opacity: label.stale ? QUIET_OPACITY : 1,
                  }}
                />
                <View
                  className="mt-0.5 rounded bg-card px-1"
                  style={{ opacity: label.stale ? QUIET_OPACITY : 1 }}
                >
                  <Text className="text-[11px] text-foreground">{label.text}</Text>
                </View>
              </View>
            </ViewAnnotation>
          )
        })}

      {ownPosition && (
        <ViewAnnotation id="own-position" lngLat={[ownPosition.longitude, ownPosition.latitude]}>
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: palette.ocean500,
              borderWidth: 3,
              borderColor: "white",
            }}
          />
        </ViewAnnotation>
      )}
    </>
  )
}
