import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { useCallback, useEffect, useState } from "react"
import { Alert, ScrollView } from "react-native"

import type { Block } from "@shared/dtos/block"
import type { Connection, ConnectionUser } from "@shared/dtos/connection"
import type { PaddlerSearchResult } from "@shared/dtos/paddler-search"

import { BlockedRow } from "../../../../components/paddlers/blocked-row"
import {
  ConnectionRow,
  type ConnectionDirection,
} from "../../../../components/paddlers/connection-row"
import { PaddlerResultCard } from "../../../../components/paddlers/paddler-result-card"
import { Chip } from "../../../../components/ui/chip"
import { Input } from "../../../../components/ui/input"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getSession } from "../../../../lib/auth/session"
import { blockPaddler, listBlocks, unblockPaddler } from "../../../../lib/blocks/actions"
import {
  acceptConnection,
  listConnections,
  removeConnection,
  requestConnection,
  searchPaddlers,
} from "../../../../lib/connections/actions"

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

  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [connectionsError, setConnectionsError] = useState<string | null>(null)

  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [blocksError, setBlocksError] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

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

  const loadConnections = useCallback(async () => {
    setConnectionsError(null)
    try {
      setConnections(await listConnections())
    } catch (err) {
      setConnectionsError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      )
    }
  }, [])

  const loadBlocks = useCallback(async () => {
    setBlocksError(null)
    try {
      setBlocks(await listBlocks())
    } catch (err) {
      setBlocksError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === "buddies") void loadConnections()
    if (next === "blocked") void loadBlocks()
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
      await loadConnections()
    } catch (err) {
      setConnectionsError(err instanceof Error ? err.message : "Failed to accept request.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(connection: Connection) {
    if (!connection.id) return
    setBusyId(connection.id)
    try {
      await removeConnection(connection.id)
      await loadConnections()
    } catch (err) {
      setConnectionsError(err instanceof Error ? err.message : "Failed to remove connection.")
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
      await loadConnections()
    } catch (err) {
      setConnectionsError(err instanceof Error ? err.message : "Failed to block paddler.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnblock(block: Block) {
    if (!block.id) return
    setBusyId(block.id)
    try {
      await unblockPaddler(block.id)
      await loadBlocks()
    } catch (err) {
      setBlocksError(err instanceof Error ? err.message : "Failed to unblock paddler.")
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
          {searchError && <Text className="text-sm text-destructive">{searchError}</Text>}
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
          {connectionsError && <Text className="text-sm text-destructive">{connectionsError}</Text>}
          {(connections ?? []).map((connection) => (
            <ConnectionRow
              key={connection.id}
              counterparty={counterpartyOf(connection, userId)}
              direction={directionOf(connection, userId)}
              busy={busyId === connection.id}
              onAccept={() => void handleAccept(connection)}
              onRemove={() => void handleRemove(connection)}
              onBlock={() => confirmBlock(connection)}
            />
          ))}
          {connections?.length === 0 && (
            <Text className="text-center text-muted-foreground">No connections yet.</Text>
          )}
        </ScrollView>
      )}

      {tab === "blocked" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          {blocksError && <Text className="text-sm text-destructive">{blocksError}</Text>}
          {(blocks ?? []).map((block) => (
            <BlockedRow
              key={block.id}
              blocked={block.blocked}
              busy={busyId === block.id}
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
