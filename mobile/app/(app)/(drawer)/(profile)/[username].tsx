import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { AwardIcon } from "lucide-react-native"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import type { PublicUser } from "@shared/dtos/public-profile"
import { palette } from "@shared/tokens"

import { StatsPanel } from "../../../../components/profile/stats-panel"
import { Badge } from "../../../../components/ui/badge"
import { Card, CardContent } from "../../../../components/ui/card"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getPublicProfile } from "../../../../lib/profile/actions"

// Undifferentiated "not found" for missing/inactive/deletion-pending/non-public —
// no existence oracle (M7a). Same privacy behavior web's public profile page has.
export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>()
  const [profile, setProfile] = useState<PublicUser | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getPublicProfile(username).then((result) => {
      if (!cancelled) setProfile(result)
    })
    return () => {
      cancelled = true
    }
  }, [username])

  if (profile === undefined) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        <RouterStack.Screen options={{ title: username }} />
        <ActivityIndicator />
      </Screen>
    )
  }

  if (profile === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-2 p-6">
        <RouterStack.Screen options={{ title: "Not found" }} />
        <Text className="text-center text-muted-foreground">
          This paddler couldn&rsquo;t be found.
        </Text>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      <RouterStack.Screen options={{ title: profile.username }} />
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Stack className="gap-1">
          <Text className="text-xl font-semibold">
            {profile.name} {profile.surname ?? ""}
          </Text>
          <Text className="text-sm text-muted-foreground">@{profile.username}</Text>
          {profile.bio && <Text className="text-sm text-foreground">{profile.bio}</Text>}
          {profile.homeLocation && (
            <Text className="text-sm text-muted-foreground">{profile.homeLocation}</Text>
          )}
        </Stack>

        <StatsPanel stats={profile.stats} />

        {profile.certifications.length > 0 && (
          <Stack className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Certifications</Text>
            {profile.certifications.map((cert, index) => (
              <Card key={index}>
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
      </ScrollView>
    </Screen>
  )
}
