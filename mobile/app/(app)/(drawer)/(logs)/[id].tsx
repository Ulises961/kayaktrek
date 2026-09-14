import { Stack as RouterStack, useLocalSearchParams, useRouter } from "expo-router"
import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert } from "react-native"

import type { Log, LogFields } from "@shared/dtos/log"
import { beaufortLabel } from "@shared/weather/beaufort"
import { palette } from "@shared/tokens"

import { Button } from "../../../../components/ui/button"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { LogForm } from "../../../../components/logs/log-form"
import { getSession } from "../../../../lib/auth/session"
import {
  deleteLog,
  endorseLog,
  getLog,
  unendorseLog,
  updateLog,
} from "../../../../lib/logs/actions"

const header = <RouterStack.Screen options={{ title: "Log" }} />

// Own logs are editable in place; a log surfaced via the "Endorsed" tab (someone
// else's) shows read-only with an endorse/withdraw toggle instead — same screen,
// branching on whether the caller is the author (plans/M9i.md WP1).
export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [log, setLog] = useState<Log | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [session, fetchedLog] = await Promise.all([getSession(), getLog(id)])
      setUserId(session?.userId ?? null)
      setLog(fetchedLog)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function handleUpdate(fields: LogFields) {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await updateLog(id, fields)
      setLog(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update log.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    setError(null)
    try {
      await deleteLog(id)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete log.")
      setSubmitting(false)
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this log?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void handleDelete() },
    ])
  }

  async function handleToggleEndorsement(isEndorsedByMe: boolean) {
    setSubmitting(true)
    setError(null)
    try {
      if (isEndorsedByMe) await unendorseLog(id)
      else await endorseLog(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update endorsement.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!log && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!log) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    )
  }

  const isOwner = !!userId && log.userId === userId
  const isEndorsedByMe = !!userId && (log.endorsers ?? []).some((e) => e.id === userId)

  if (!isOwner) {
    return (
      <Screen edges={["bottom"]} className="gap-4 p-4">
        {header}
        <Stack className="gap-1">
          <Text className="text-lg font-semibold">{log.date}</Text>
          {log.notes && <Text className="text-sm text-muted-foreground">{log.notes}</Text>}
        </Stack>
        <Row className="flex-wrap gap-x-3 gap-y-1">
          {log.hours != null && (
            <Row className="items-center gap-1">
              <ClockIcon size={12} color={palette.ocean500} />
              <Text className="text-[11px] tabular-nums text-muted-foreground">
                {log.hours.toFixed(1)}h
              </Text>
            </Row>
          )}
          {log.distance != null && (
            <Row className="items-center gap-1">
              <RouteIcon size={12} color={palette.ocean500} />
              <Text className="text-[11px] tabular-nums text-muted-foreground">
                {log.distance.toFixed(1)} km
              </Text>
            </Row>
          )}
          {log.avgSea != null && (
            <Row className="items-center gap-1">
              <WavesIcon size={12} color={palette.ocean500} />
              <Text className="text-[11px] text-muted-foreground">
                B{log.avgSea} · {beaufortLabel(log.avgSea)}
              </Text>
            </Row>
          )}
        </Row>
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        <Button
          disabled={submitting}
          variant={isEndorsedByMe ? "outline" : "default"}
          onPress={() => void handleToggleEndorsement(isEndorsedByMe)}
        >
          {isEndorsedByMe ? "Withdraw endorsement" : "Endorse this log"}
        </Button>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]} className="gap-4 p-4">
      {header}
      <LogForm
        initial={log}
        submitLabel="Save changes"
        submitting={submitting}
        error={error}
        onSubmit={(fields) => void handleUpdate(fields)}
      />
      <Button variant="destructive" disabled={submitting} onPress={confirmDelete}>
        Delete log
      </Button>
    </Screen>
  )
}
