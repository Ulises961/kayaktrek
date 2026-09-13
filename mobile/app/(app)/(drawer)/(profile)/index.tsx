import { Stack as RouterStack, Link } from "expo-router"
import { AwardIcon } from "lucide-react-native"
import { DrawerToggleButton } from "expo-router/drawer"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, Switch } from "react-native"

import type { User } from "@shared/dtos/user"
import type { Stats } from "@shared/dtos/public-profile"
import { palette } from "@shared/tokens"

import { StatsPanel } from "../../../../components/profile/stats-panel"
import { Badge } from "../../../../components/ui/badge"
import { Button } from "../../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getLogStats } from "../../../../lib/logs/actions"
import { getMe, setProfileVisibility } from "../../../../lib/profile/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Profile" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Profile", headerLeft: () => <DrawerToggleButton /> }} />
)

// Certifications render read-only here — add/edit/delete needs the elevated
// re-auth token flow (backend/Resources/user_certification_resource.py), which
// mobile doesn't have yet. Deferred rather than half-built (plans/M9i.md WP1).
export default function ProfileScreen() {
  const [me, setMe] = useState<User | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [user, myStats] = await Promise.all([getMe(), getLogStats()])
      setMe(user)
      setStats(myStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function handleToggleVisibility(next: boolean) {
    if (!me) return
    setTogglingVisibility(true)
    try {
      const updated = await setProfileVisibility(next)
      setMe(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile visibility.")
    } finally {
      setTogglingVisibility(false)
    }
  }

  if (!me && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!me) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
        <Button onPress={() => void load()}>Try again</Button>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Stack className="gap-1">
          <Row className="justify-between">
            <Text className="text-xl font-semibold">
              {me.name} {me.surname ?? ""}
            </Text>
            <Link href="/profile/edit" asChild>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </Link>
          </Row>
          <Text className="text-sm text-muted-foreground">@{me.username}</Text>
          {me.bio && <Text className="text-sm text-foreground">{me.bio}</Text>}
          {me.homeLocation && (
            <Text className="text-sm text-muted-foreground">{me.homeLocation}</Text>
          )}
        </Stack>

        {stats && <StatsPanel stats={stats} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public profile</CardTitle>
          </CardHeader>
          <CardContent>
            <Row className="justify-between">
              <Text className="text-sm text-muted-foreground">
                {me.profileIsPublic ? "Visible to other paddlers" : "Private"}
              </Text>
              <Switch
                value={!!me.profileIsPublic}
                onValueChange={(v) => void handleToggleVisibility(v)}
                disabled={togglingVisibility}
              />
            </Row>
          </CardContent>
        </Card>

        {!!me.certifications?.length && (
          <Stack className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Certifications</Text>
            {me.certifications.map((cert, index) => (
              <Card key={cert.id ?? String(index)}>
                <CardContent className="gap-1">
                  <Row className="justify-between">
                    <Row className="items-center gap-1.5">
                      <AwardIcon size={12} color={palette.ocean500} />
                      <Text className="font-medium">{cert.award}</Text>
                    </Row>
                    <Badge variant="secondary">{cert.organization}</Badge>
                  </Row>
                  {cert.validUntil && (
                    <Text className="text-xs text-muted-foreground">
                      Valid until {cert.validUntil}
                    </Text>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        {error && <Text className="text-sm text-destructive">{error}</Text>}
      </ScrollView>
    </Screen>
  )
}
