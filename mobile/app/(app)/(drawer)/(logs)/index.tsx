import { Stack as RouterStack, Link } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import type { Log } from "@shared/dtos/log"
import type { Stats } from "@shared/dtos/public-profile"
import type { EndorsementRequest } from "@shared/dtos/endorsement-request"
import { formatDayDate } from "@shared/utils/date"

import { LogCard } from "@mobile/components/logs/log-card"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import {
  deleteEndorsementRequest,
  listEndorsementRequests,
} from "@mobile/lib/endorsement-requests/actions"
import { endorseLog, getEndorsedLogs, getLogs, getLogStats } from "@mobile/lib/logs/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Logs" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Logs", headerLeft: () => <DrawerToggleButton /> }} />
)

type Tab = "mine" | "endorsed"

// Network-mutate only, no offline cache (M9i, plans/M9i.md WP1) — mirrors M9b's
// "validate the round trip" scope for a new feature area rather than a new
// milestone's worth of pagination/filter UI.
export default function LogsScreen() {
  const [tab, setTab] = useState<Tab>("mine")
  const [mine, setMine] = useState<Log[] | null>(null)
  const [endorsed, setEndorsed] = useState<Log[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [requests, setRequests] = useState<EndorsementRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true)
    setError(null)
    try {
      const [minePage, endorsedPage, statsResult, incoming] = await Promise.all([
        getLogs(),
        getEndorsedLogs(),
        getLogStats(),
        listEndorsementRequests("incoming"),
      ])
      setMine(minePage.items)
      setEndorsed(endorsedPage.items)
      setStats(statsResult)
      setRequests(incoming)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      if (isRefresh) setIsRefreshing(false)
    }
  }, [])

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
      setError(err instanceof Error ? err.message : "Failed to endorse log.")
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
      setError(err instanceof Error ? err.message : "Failed to remove request.")
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
        {stats && stats.logCount > 0 && (
          <Row className="gap-3">
            <Card className="flex-1 items-center py-3">
              <Text className="text-xs uppercase text-muted-foreground">Hours</Text>
              <Text className="text-lg font-semibold tabular-nums">
                {stats.totalHours.toFixed(1)}
              </Text>
            </Card>
            <Card className="flex-1 items-center py-3">
              <Text className="text-xs uppercase text-muted-foreground">Distance</Text>
              <Text className="text-lg font-semibold tabular-nums">
                {stats.totalDistance.toFixed(1)} km
              </Text>
            </Card>
            <Card className="flex-1 items-center py-3">
              <Text className="text-xs uppercase text-muted-foreground">Trips</Text>
              <Text className="text-lg font-semibold tabular-nums">{stats.tripCount}</Text>
            </Card>
          </Row>
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
            <Button size="sm" variant="outline">
              + New
            </Button>
          </Link>
        </Row>

        {shown.length === 0 ? (
          <Text className="text-center text-muted-foreground">
            {tab === "mine" ? "No logs yet." : "You haven't endorsed any logs yet."}
          </Text>
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
