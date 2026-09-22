import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { useCallback, useEffect, useState } from "react"
import { Alert, ScrollView } from "react-native"

import type { Block } from "@shared/dtos/block"
import type { Connection, ConnectionUser } from "@shared/dtos/connection"
import type { PaddlerSearchResult } from "@shared/dtos/paddler-search"

import { UserGroupIcon } from "@mobile/components/icons/heroicons-user-group"
import { BlockedRow } from "@mobile/components/paddlers/blocked-row"
import {
  ConnectionRow,
  type ConnectionDirection,
} from "@mobile/components/paddlers/connection-row"
import { PaddlerResultCard } from "@mobile/components/paddlers/paddler-result-card"
import { Chip } from "@mobile/components/ui/chip"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import { getSession } from "@mobile/lib/auth/session"
import { blockPaddler, listBlocks, unblockPaddler } from "@mobile/lib/blocks/actions"
import {
  acceptConnection,
  listConnections,
  removeConnection,
  requestConnection,
  searchPaddlers,
} from "@mobile/lib/connections/actions"
import { loadBlocksCache, loadConnectionsCache, saveBlocksCache, saveConnectionsCache } from "@mobile/lib/db/paddlers-cache"
import { CACHE_KEY } from "@mobile/lib/db/cache-freshness"
import { useLiveCache } from "@mobile/lib/db/use-live-cache"
import { OFFLINE_ERROR_MESSAGE } from "@mobile/lib/api/client"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Paddlers"
// drawer item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen
    options={{ title: "Paddlers", headerLeft: () => <DrawerToggleButton /> }}
  />
)

type Tab = "search" | "buddies" | "blocked"

// A connection has no notion of "which side is me" on its own — the caller's own
// user id (from the session, not the connection row) decides both the counterparty
// and whether a pending row is incoming or outgoing (M9i WP2, plans/M9i.md).
function directionOf(connection: Connection, userId: string | null): ConnectionDirection {
  if (connection.status === "accepted") return "accepted"
  return connection.addressee.id === userId ? "incoming" : "outgoing"
}

function counterpartyOf(connection: Connection, userId: string | null): ConnectionUser {
  return connection.requester.id === userId ? connection.addressee : connection.requester
}

export default function PaddlersScreen() {
  const [tab, setTab] = useState<Tab>("search")
  const [userId, setUserId] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PaddlerSearchResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

  // Live-first, cache-fallback — same shape as the trip list / itinerary
  // screens (M9c WP6), extracted into one hook (useLiveCache) since this
  // exact pattern was duplicated across this screen, the logs screen, and
  // the Items screen's requirement checklist. Buddies/blocks have no delta
  // sync (no per-row invariant worth a WatermelonDB channel for), so this is
  // a plain wholesale-replace cache, same as the trip list's.
  const connectionsCache = useLiveCache<Connection[]>({
    fetchLive: listConnections,
    loadCache: loadConnectionsCache,
    saveCache: saveConnectionsCache,
    isCacheEmpty: (data) => data.length === 0,
    cacheKey: CACHE_KEY.connections,
  })
  const connections = connectionsCache.data
  const connectionsError = connectionsCache.error
  const connectionsOffline = connectionsCache.isOffline

  const blocksCache = useLiveCache<Block[]>({
    fetchLive: listBlocks,
    loadCache: loadBlocksCache,
    saveCache: saveBlocksCache,
    isCacheEmpty: (data) => data.length === 0,
    cacheKey: CACHE_KEY.blocks,
  })
  const blocks = blocksCache.data
  const blocksError = blocksCache.error
  const blocksOffline = blocksCache.isOffline

  useEffect(() => {
    void getSession().then((session) => setUserId(session?.userId ?? null))
  }, [])

  const runSearch = useCallback(async () => {
    setSearchError(null)
    try {
      const page = await searchPaddlers(query)
      setResults(page.items)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [query])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === "buddies") void connectionsCache.reload()
    if (next === "blocked") void blocksCache.reload()
  }

  async function handleConnect(paddler: PaddlerSearchResult) {
    setBusyId(paddler.id)
    try {
      await requestConnection({ username: paddler.username, userId: paddler.id })
      setResults(
        (prev) =>
          prev?.map((p) =>
            p.id === paddler.id ? { ...p, relationship: "pending_outgoing" as const } : p,
          ) ?? null,
      )
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to send request.")
    } finally {
      setBusyId(null)
    }
  }

  // Search results carry their own connectionId (PaddlerSearchResultSchema) — canceling
  // from here needs no round trip through the Buddies tab.
  async function handleCancelFromSearch(paddler: PaddlerSearchResult) {
    if (!paddler.connectionId) return
    setBusyId(paddler.id)
    try {
      await removeConnection(paddler.connectionId)
      setResults(
        (prev) =>
          prev?.map((p) =>
            p.id === paddler.id ? { ...p, relationship: "none" as const, connectionId: null } : p,
          ) ?? null,
      )
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to cancel request.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleAccept(connection: Connection) {
    if (!connection.id) return
    setBusyId(connection.id)
    try {
      await acceptConnection(connection.id)
      await connectionsCache.reload()
    } catch (err) {
      connectionsCache.setError(err instanceof Error ? err.message : "Failed to accept request.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(connection: Connection) {
    if (!connection.id) return
    setBusyId(connection.id)
    try {
      await removeConnection(connection.id)
      await connectionsCache.reload()
    } catch (err) {
      connectionsCache.setError(err instanceof Error ? err.message : "Failed to remove connection.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleBlockFromConnection(connection: Connection) {
    if (!connection.id) return
    const counterparty = counterpartyOf(connection, userId)
    setBusyId(connection.id)
    try {
      await blockPaddler({ username: counterparty.username, userId: counterparty.id })
      await connectionsCache.reload()
    } catch (err) {
      connectionsCache.setError(err instanceof Error ? err.message : "Failed to block paddler.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnblock(block: Block) {
    if (!block.id) return
    setBusyId(block.id)
    try {
      await unblockPaddler(block.id)
      await blocksCache.reload()
    } catch (err) {
      blocksCache.setError(err instanceof Error ? err.message : "Failed to unblock paddler.")
    } finally {
      setBusyId(null)
    }
  }

  function confirmBlock(connection: Connection) {
    const counterparty = counterpartyOf(connection, userId)
    Alert.alert(
      `Block ${counterparty.name}?`,
      "They won't be able to see your profile or reconnect with you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void handleBlockFromConnection(connection),
        },
      ],
    )
  }

  function confirmUnblock(block: Block) {
    Alert.alert(`Unblock ${block.blocked.name}?`, "They'll be able to see your profile again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unblock", onPress: () => void handleUnblock(block) },
    ])
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <Row className="gap-2 px-4 pt-3">
        <Chip active={tab === "search"} onPress={() => selectTab("search")}>
          Search
        </Chip>
        <Chip active={tab === "buddies"} onPress={() => selectTab("buddies")}>
          Buddies
        </Chip>
        <Chip active={tab === "blocked"} onPress={() => selectTab("blocked")}>
          Blocked
        </Chip>
      </Row>

      {tab === "search" && (
        <Stack className="flex-1 gap-3 p-4">
          <Input
            placeholder="Search paddlers"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            autoCapitalize="none"
          />
          {searchError &&
            (searchError === OFFLINE_ERROR_MESSAGE ? (
              <Text className="rounded-md bg-muted px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                Search needs a connection — you&rsquo;re offline.
              </Text>
            ) : (
              <Text className="text-sm text-destructive">{searchError}</Text>
            ))}
          <ScrollView contentContainerClassName="gap-3">
            {(results ?? []).map((paddler) => (
              <PaddlerResultCard
                key={paddler.id}
                paddler={paddler}
                busy={busyId === paddler.id}
                onConnect={() => void handleConnect(paddler)}
                onCancel={() => void handleCancelFromSearch(paddler)}
              />
            ))}
          </ScrollView>
        </Stack>
      )}

      {tab === "buddies" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          <OfflineNotice visible={connectionsOffline} cachedAt={connectionsCache.cachedAt}>
            Buddies: accepting and removing need a connection.
          </OfflineNotice>
          {connectionsError && <Text className="text-sm text-destructive">{connectionsError}</Text>}
          {(connections ?? []).map((connection) => (
            <ConnectionRow
              key={connection.id}
              counterparty={counterpartyOf(connection, userId)}
              direction={directionOf(connection, userId)}
              busy={busyId === connection.id || connectionsOffline}
              onAccept={() => void handleAccept(connection)}
              onRemove={() => void handleRemove(connection)}
              onBlock={() => confirmBlock(connection)}
            />
          ))}
          {connections?.length === 0 && (
            <EmptyPanel
              icon={UserGroupIcon}
              title="No buddies yet"
              description="Paddlers you connect with appear here, so you can invite them to a trip without searching each time."
            />
          )}
        </ScrollView>
      )}

      {tab === "blocked" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          <OfflineNotice visible={blocksOffline} cachedAt={blocksCache.cachedAt}>
            Blocklist: unblocking needs a connection.
          </OfflineNotice>
          {blocksError && <Text className="text-sm text-destructive">{blocksError}</Text>}
          {(blocks ?? []).map((block) => (
            <BlockedRow
              key={block.id}
              blocked={block.blocked}
              busy={busyId === block.id || blocksOffline}
              onUnblock={() => confirmUnblock(block)}
            />
          ))}
          {blocks?.length === 0 && (
            <Text className="text-center text-muted-foreground">No blocked paddlers.</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}
