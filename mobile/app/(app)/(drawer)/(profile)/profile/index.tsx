import { Stack as RouterStack, Link } from "expo-router"
import { AwardIcon } from "lucide-react-native"
import { DrawerToggleButton } from "expo-router/drawer"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, Switch } from "react-native"

import type { User } from "@shared/dtos/user"
import type { Stats } from "@shared/dtos/public-profile"
import { palette } from "@shared/tokens"

import { StatsPanel } from "@mobile/components/profile/stats-panel"
import { Avatar } from "@mobile/components/ui/avatar"
import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { NeedsConnectionNotice, OfflineNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import { isOfflineError } from "@mobile/lib/api/client"
import { CACHE_KEY } from "@mobile/lib/db/cache-freshness"
import {
  loadLogStatsCache,
  loadMeCache,
  saveLogStatsCache,
  saveMeCache,
} from "@mobile/lib/db/profile-cache"
import { useLiveCache } from "@mobile/lib/db/use-live-cache"
import { getLogStats } from "@mobile/lib/logs/actions"
import { useIsOffline } from "@mobile/lib/network/use-is-offline"
import { getMe, setProfileVisibility } from "@mobile/lib/profile/actions"

type ProfileData = {
  me: User | null
  stats: Stats | null
}

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Profile" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Profile", headerLeft: () => <DrawerToggleButton /> }} />
)

// Certifications render read-only here — add/edit/delete needs the elevated
// re-auth token flow (backend/Resources/user_certification_resource.py), which
// mobile doesn't have yet. Deferred rather than half-built (plans/M9i.md WP1).
export default function ProfileScreen() {
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  // M9c WP7 tier 4: offline, the record and stats the sweep cached. Stats are
  // optional in the cache — a profile without them is still worth showing.
  const profileCache = useLiveCache<ProfileData>({
    fetchLive: async () => {
      const [me, stats] = await Promise.all([getMe(), getLogStats()])
      return { me, stats }
    },
    loadCache: async () => {
      const [me, stats] = await Promise.all([loadMeCache(), loadLogStatsCache()])
      return { me, stats }
    },
    saveCache: async ({ me, stats }) => {
      if (me) await saveMeCache(me)
      if (stats) await saveLogStatsCache(stats)
    },
    isCacheEmpty: (data) => data.me === null,
    cacheKey: CACHE_KEY.me,
  })
  const { data, error, setData, setError } = profileCache
  const me = data?.me ?? null
  const stats = data?.stats ?? null
  const isShowingCache = profileCache.isOffline
  const isDeviceOffline = useIsOffline()
  const isOffline = isShowingCache || isDeviceOffline

  const { reload } = profileCache
  useEffect(() => {
    void reload()
  }, [reload])

  async function handleToggleVisibility(next: boolean) {
    if (!me || isOffline) return
    setTogglingVisibility(true)
    try {
      const updated = await setProfileVisibility(next)
      setData((previous) => ({ stats: previous?.stats ?? null, me: updated }))
      void saveMeCache(updated).catch(() => undefined)
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
    // Never cached and offline: the banner says so, and a retry button would
    // only fail again until the connection is back.
    if (isOfflineError(error)) {
      return (
        <Screen edges={["bottom"]}>
          {header}
          <NeedsConnectionNotice>Profile needs a connection.</NeedsConnectionNotice>
        </Screen>
      )
    }
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
        <Button onPress={() => void reload()}>Try again</Button>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <OfflineNotice visible={isShowingCache} cachedAt={profileCache.cachedAt}>
        Editing your profile needs a connection.
      </OfflineNotice>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Row className="items-start justify-between">
          <Row className="flex-1 items-center gap-3">
            <Avatar name={me.name} surname={me.surname} imageUrl={me.avatarUrl} size={56} />
            <Stack className="flex-1 gap-1">
              <Text className="text-xl font-semibold">
                {me.name} {me.surname ?? ""}
              </Text>
              <Text className="text-sm text-muted-foreground">@{me.username}</Text>
            </Stack>
          </Row>
          {!isOffline && (
            <Link href="/profile/edit" asChild>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </Link>
          )}
        </Row>
        {(me.bio || me.homeLocation) && (
          <Stack className="gap-1">
            {me.bio && <Text className="text-sm text-foreground">{me.bio}</Text>}
            {me.homeLocation && (
              <Text className="text-sm text-muted-foreground">{me.homeLocation}</Text>
            )}
          </Stack>
        )}

        {stats && (
          <Stack className="gap-2">
            <SectionLabel>Paddling</SectionLabel>
            <StatsPanel stats={stats} />
          </Stack>
        )}

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
                disabled={togglingVisibility || isOffline}
              />
            </Row>
          </CardContent>
        </Card>

        {!!me.certifications?.length && (
          <Stack className="gap-2">
            <SectionLabel>Certifications</SectionLabel>
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
