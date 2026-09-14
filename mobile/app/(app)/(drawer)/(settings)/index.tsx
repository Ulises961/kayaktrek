import Constants from "expo-constants"
import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Linking } from "react-native"

import type { User } from "@shared/dtos/user"
import { DISTANCE_UNIT, type DistanceUnit } from "@shared/itinerary/distance"

import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { getMe, setUnitPreference } from "@mobile/lib/profile/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Settings" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Settings", headerLeft: () => <DrawerToggleButton /> }} />
)

// M30: minimal stub (unit preference + legal links + version) — the web-parity Settings
// page (account email/phone, change password, device sessions, data export/delete) is
// its own follow-up (plans/M30-mobile-visual-identity-and-parity.md WP4). This exists so
// the drawer restructure (Profile moved to the header identity row, this item taking its
// slot) has something real to point at rather than a dead stub.
export default function SettingsScreen() {
  const [me, setMe] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changingUnit, setChangingUnit] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setMe(await getMe())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function handleChangeUnit(next: DistanceUnit) {
    if (!me || me.unitPreference === next) return
    const previous = me.unitPreference
    setChangingUnit(true)
    setMe({ ...me, unitPreference: next }) // optimistic, mirrors web's unit select
    try {
      const updated = await setUnitPreference(next)
      setMe(updated)
    } catch {
      setMe((current) => (current ? { ...current, unitPreference: previous } : current))
      setError("Failed to update unit preference.")
    } finally {
      setChangingUnit(false)
    }
  }

  return (
    <Screen edges={["bottom"]} className="gap-4 p-4">
      {header}

      {!me && !error && <ActivityIndicator />}

      {me && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distance unit</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <Row className="gap-2">
              <Chip
                active={me.unitPreference === DISTANCE_UNIT.NM}
                disabled={changingUnit}
                onPress={() => void handleChangeUnit(DISTANCE_UNIT.NM)}
              >
                Nautical miles
              </Chip>
              <Chip
                active={me.unitPreference === DISTANCE_UNIT.KM}
                disabled={changingUnit}
                onPress={() => void handleChangeUnit(DISTANCE_UNIT.KM)}
              >
                Kilometres
              </Chip>
            </Row>
            <Text className="text-xs text-muted-foreground">
              Used across the planner, logbook, and stats.
            </Text>
          </CardContent>
        </Card>
      )}

      {error && <Text className="text-sm text-destructive">{error}</Text>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legal</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <Text
            className="text-sm text-primary underline"
            onPress={() => void Linking.openURL("https://kayaktrek.app/terms")}
          >
            Terms of Use
          </Text>
          <Text
            className="text-sm text-primary underline"
            onPress={() => void Linking.openURL("https://kayaktrek.app/privacy")}
          >
            Privacy Policy
          </Text>
          <Text
            className="text-sm text-primary underline"
            onPress={() => void Linking.openURL("mailto:support@kayaktrek.app")}
          >
            Contact
          </Text>
        </CardContent>
      </Card>

      <Stack className="items-center pt-2">
        <Text className="text-xs text-muted-foreground">
          Kayaktrek v{Constants.expoConfig?.version ?? "—"}
        </Text>
      </Stack>
    </Screen>
  )
}
