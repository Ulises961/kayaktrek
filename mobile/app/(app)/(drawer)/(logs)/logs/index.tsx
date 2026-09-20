import { Stack as RouterStack, Link } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { Newspaper } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import type { Log } from "@shared/dtos/log"
import type { Stats } from "@shared/dtos/public-profile"
import type { EndorsementRequest } from "@shared/dtos/endorsement-request"
import { formatDayDate } from "@shared/utils/date"

import { LogCard } from "@mobile/components/logs/log-card"
import { StatsPanel } from "@mobile/components/profile/stats-panel"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import {
  deleteEndorsementRequest,
  listEndorsementRequests,
} from "@mobile/lib/endorsement-requests/actions"
import { loadLogsCache, saveLogsCache } from "@mobile/lib/db/logs-cache"
import { CACHE_KEY } from "@mobile/lib/db/cache-freshness"
import { useLiveCache } from "@mobile/lib/db/use-live-cache"
import { endorseLog, getEndorsedLogs, getLogs, getLogStats } from "@mobile/lib/logs/actions"

type LogLists = { mine: Log[]; endorsed: Log[] }

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Logs" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Logs", headerLeft: () => <DrawerToggleButton /> }} />
)

type Tab = "mine" | "endorsed"

// Live-first, cache-fallback for the two log lists (M9c WP6's shape, extended
// here) — a wholesale-replace cache per kind, same as the trip list's. Stats
// and incoming endorsement requests stay live-only: they're small, secondary
// panels, not the reason someone opens this screen offline.
export default function LogsScreen() {
  const [tab, setTab] = useState<Tab>("mine")
  const [stats, setStats] = useState<Stats | null>(null)
  const [requests, setRequests] = useState<EndorsementRequest[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(null)

  // Stats and incoming endorsement requests stay live-only (set as a side
  // effect of fetchLive, below) — they're small, secondary panels, not the
  // reason someone opens this screen offline, so they have no cache of their
  // own and simply keep their last value if the combined fetch fails.
  const logsCache = useLiveCache<LogLists>({
    fetchLive: async () => {
      const [minePage, endorsedPage, statsResult, incoming] = await Promise.all([
        getLogs(),
        getEndorsedLogs(),
        getLogStats(),
        listEndorsementRequests("incoming"),
      ])
      setStats(statsResult)
      setRequests(incoming)
      return { mine: minePage.items, endorsed: endorsedPage.items }
    },
    loadCache: async () => {
      const [cachedMine, cachedEndorsed] = await Promise.all([
        loadLogsCache("mine"),
        loadLogsCache("endorsed"),
      ])
      return { mine: cachedMine, endorsed: cachedEndorsed }
    },
    saveCache: async (lists) => {
      await Promise.all([
        saveLogsCache("mine", lists.mine),
        saveLogsCache("endorsed", lists.endorsed),
      ])
    },
    isCacheEmpty: (lists) => lists.mine.length === 0 && lists.endorsed.length === 0,
    cacheKey: CACHE_KEY.logs,
  })
  const mine = logsCache.data?.mine ?? null
  const endorsed = logsCache.data?.endorsed ?? null
  const error = logsCache.error
  const isOffline = logsCache.isOffline

  const reloadLogs = logsCache.reload
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true)
      try {
        await reloadLogs()
      } finally {
        if (isRefresh) setIsRefreshing(false)
      }
    },
    [reloadLogs],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function acceptRequest(request: EndorsementRequest) {
    if (!request.id || !request.log.id) return
    setActioningRequestId(request.id)
    try {
      await endorseLog(request.log.id)
      setRequests((prev) => prev.filter((r) => r.id !== request.id))
      void load(true)
    } catch (err) {
      logsCache.setError(err instanceof Error ? err.message : "Failed to endorse log.")
    } finally {
      setActioningRequestId(null)
    }
  }

  async function declineRequest(request: EndorsementRequest) {
    if (!request.id) return
    setActioningRequestId(request.id)
    try {
      await deleteEndorsementRequest(request.id)
      setRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      logsCache.setError(err instanceof Error ? err.message : "Failed to remove request.")
    } finally {
      setActioningRequestId(null)
    }
  }

  if (mine === null && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (error && mine === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
        <Button onPress={() => void load()}>Try again</Button>
      </Screen>
    )
  }

  const shown = tab === "mine" ? (mine ?? []) : (endorsed ?? [])

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} />
        }
      >
        <OfflineNotice visible={isOffline} cachedAt={logsCache.cachedAt}>
          Offline — showing your last synced logs. Recording a paddle needs a connection.
        </OfflineNotice>

        {stats && (
          <Stack className="gap-2">
            <SectionLabel>Paddling</SectionLabel>
            <StatsPanel stats={stats} />
          </Stack>
        )}

        {requests.length > 0 && (
          <Stack className="gap-2">
            <Text className="text-sm font-semibold text-foreground">
              Asked to endorse ({requests.length})
            </Text>
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="gap-2">
                  <Text className="text-sm">
                    {request.requester.name} asked you to endorse their{" "}
                    {formatDayDate(request.log.date)} paddle
                  </Text>
                  <Row className="gap-2">
                    <Button
                      size="sm"
                      disabled={actioningRequestId === request.id}
                      onPress={() => void acceptRequest(request)}
                    >
                      Endorse
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actioningRequestId === request.id}
                      onPress={() => void declineRequest(request)}
                    >
                      Decline
                    </Button>
                  </Row>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        <Row className="justify-between">
          <Row className="gap-2">
            <Chip active={tab === "mine"} onPress={() => setTab("mine")}>
              My logs
            </Chip>
            <Chip active={tab === "endorsed"} onPress={() => setTab("endorsed")}>
              Endorsed
            </Chip>
          </Row>
          <Link href="/logs/new" asChild>
            <Button size="sm" variant="cta" disabled={isOffline}>
              + New
            </Button>
          </Link>
        </Row>

        {shown.length === 0 ? (
          <EmptyPanel
            icon={Newspaper}
            title={tab === "mine" ? "No logs yet" : "No endorsed logs yet"}
            description={
              tab === "mine"
                ? "Record a paddle and it lands here with its distance, conditions and anyone who was on the water with you."
                : undefined
            }
          />
        ) : (
          <Stack className="gap-3">
            {shown.map((log, index) => (
              <LogCard key={log.id ?? String(index)} log={log} />
            ))}
          </Stack>
        )}
      </ScrollView>
    </Screen>
  )
}
