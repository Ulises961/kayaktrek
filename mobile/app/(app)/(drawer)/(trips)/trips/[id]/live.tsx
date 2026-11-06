import { Stack as RouterStack, useIsFocused, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ScrollView } from "react-native"

import { CloseDayCard } from "@mobile/components/live/close-day-card"
import { CrewStatusList } from "@mobile/components/live/crew-status-list"
import { SharingCard } from "@mobile/components/live/sharing-card"
import { Screen, Stack } from "@mobile/components/ui/layout"
import { loadOfflineCrew, type OfflineCrewMember } from "@mobile/lib/db/offline-float-plan"
import { isTripLeader } from "@mobile/lib/db/trip-role"
import { crewStatusRows } from "@mobile/lib/live/crew-status"
import { useCrewPositions } from "@mobile/lib/live/use-crew-positions"
import { useTripChanges } from "@mobile/lib/live/use-trip-changes"

const header = <RouterStack.Screen options={{ title: "Live" }} />

// How often the ages in the crew list are recomputed.
const AGE_TICK_MS = 30_000

// What a paddler on the water opens (M9e WP4), mirroring web's Live tab: start or stop sharing the
// position, see when each crew member was last heard from, and, for the leader, close the day. The
// hub links here only while the trip is under way. Members come from the synced crew rows; the
// positions are polled while this screen is on top.
export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const focused = useIsFocused()
  const positions = useCrewPositions(id, focused)
  const [members, setMembers] = useState<OfflineCrewMember[]>([])
  const [isLeader, setIsLeader] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const loadCrew = useCallback(async () => {
    try {
      setMembers(await loadOfflineCrew(id))
    } catch {
      setMembers([])
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set inside loadCrew's async body
    void loadCrew()
  }, [loadCrew])

  useTripChanges(id, () => void loadCrew(), { tables: ["trip_member"] })

  useEffect(() => {
    let cancelled = false
    void isTripLeader(id)
      .then((leader) => {
        if (!cancelled) setIsLeader(leader)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!focused) return
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(timer)
  }, [focused])

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView>
        <Stack className="gap-4 p-4">
          <SharingCard tripId={id} />
          <CrewStatusList rows={crewStatusRows(members, positions, now)} />
          {isLeader && <CloseDayCard tripId={id} />}
        </Stack>
      </ScrollView>
    </Screen>
  )
}
