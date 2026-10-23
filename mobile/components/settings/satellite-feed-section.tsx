import { SatelliteDishIcon, TrashIcon } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, Switch } from "react-native"

import {
  SATELLITE_PROVIDER,
  SATELLITE_PROVIDER_LABELS,
  type SatelliteFeed,
  type SatelliteFeedFormValues,
} from "@shared/dtos/satellite-feed"
import { palette } from "@shared/tokens"
import { formatTimeAgo } from "@shared/utils/date"

import { Button } from "@mobile/components/ui/button"
import { Input } from "@mobile/components/ui/input"
import { Label } from "@mobile/components/ui/label"
import { Row, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import {
  deleteSatelliteFeed,
  listSatelliteFeeds,
  saveSatelliteFeed,
} from "@mobile/lib/satellite-feeds/actions"

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// M29 — the paddler's registered satellite communicator feed. A profile setting rather
// than a per-trip one: the poll task resolves whichever trips are HAPPENING at poll time.
//
// Garmin inReach only. The backend enum carries SPOT and Zoleo, but both are blocked on
// unresolved provider research (`docs/mobile/satellite-feed-spec.md` §3.5), so the form
// offers no provider choice at all — a select with one usable option and two that fail is
// worse than no select. Mirrors web's `satellite-feed-section.tsx`.
export function SatelliteFeedSection() {
  const [feeds, setFeeds] = useState<SatelliteFeed[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SatelliteFeed | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setFeeds(await listSatelliteFeeds())
      setLoadError(null)
    } catch {
      setLoadError("Could not load your satellite feed.")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const open = adding || editing !== null

  function close() {
    setAdding(false)
    setEditing(null)
    setError(null)
  }

  async function handleSave(values: SatelliteFeedFormValues) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await saveSatelliteFeed(editing?.id ?? null, values)
      close()
      await load()
    } catch (err) {
      setError(message(err, "Failed to save the feed."))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteSatelliteFeed(id)
      await load()
    } catch (err) {
      setError(message(err, "Failed to remove the feed."))
    }
  }

  function confirmDelete(feed: SatelliteFeed) {
    Alert.alert(
      "Remove this feed?",
      "Your inReach position will stop being added to your trips. Your device's own tracking is unaffected.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void handleDelete(feed.id) },
      ],
    )
  }

  return (
    <Stack className="gap-4">
      <Text className="text-sm text-muted-foreground">
        Share your inReach position with your crew automatically. Paste your MapShare feed URL and
        it is polled about every 10 minutes while a trip is under way. Your device&apos;s SOS
        button is unaffected — it goes straight to Garmin, never through this app.
      </Text>

      {loadError ? (
        // No Add here: a failed lookup says nothing about whether a feed exists, and
        // offering to register one would invite a second over a feed that is working.
        <Stack className="items-start gap-2">
          <Text className="text-sm text-destructive">{loadError}</Text>
          <Button
            variant="outline"
            size="sm"
            onPress={() => void load()}
            testID="satellite-retry"
          >
            Try again
          </Button>
        </Stack>
      ) : feeds === null ? (
        <ActivityIndicator />
      ) : (
        <>
          {feeds.map((feed) => (
            <Stack key={feed.id} className="gap-2 rounded-lg border border-border p-4">
              <Row className="items-center gap-2">
                <SatelliteDishIcon size={14} color={palette.ocean500} />
                <Text className="text-sm font-medium">
                  {SATELLITE_PROVIDER_LABELS[feed.provider]}
                </Text>
              </Row>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {feed.feedUrl}
              </Text>

              {/* The poll task skips a needsReauth feed entirely until the user re-saves,
                  so without this a paddler believes they are being tracked while nothing
                  is being ingested. Loud on purpose. */}
              {feed.needsReauth && (
                <Text className="text-sm text-destructive">
                  Sign-in failed — this feed is not being polled. Re-enter its password to start
                  it again.
                </Text>
              )}

              <Text className="text-[11px] text-muted-foreground">
                {feed.lastPolledAt
                  ? `Last checked ${formatTimeAgo(feed.lastPolledAt)}`
                  : "Not polled yet"}
                {feed.lastIngestedAt && ` · last position ${formatTimeAgo(feed.lastIngestedAt)}`}
              </Text>

              <Row className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setAdding(false)
                    setError(null)
                    setEditing(feed)
                  }}
                  testID={`satellite-edit-${feed.id}`}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => confirmDelete(feed)}
                  testID={`satellite-remove-${feed.id}`}
                  icon={<TrashIcon size={14} color={palette.ocean700} />}
                >
                  Remove
                </Button>
              </Row>
            </Stack>
          ))}

          {open ? (
            // Keyed on the feed so switching from one feed's edit straight to another's
            // starts from that feed's values instead of the previous form's state.
            <SatelliteFeedForm
              key={editing?.id ?? "new"}
              feed={editing}
              busy={busy}
              error={error}
              onSubmit={(values) => void handleSave(values)}
              onCancel={close}
            />
          ) : (
            <Stack className="items-start gap-2">
              {error && <Text className="text-sm text-destructive">{error}</Text>}
              <Button
                variant="outline"
                size="sm"
                onPress={() => setAdding(true)}
                testID="satellite-add"
              >
                {feeds.length === 0 ? "Add a feed" : "Add another feed"}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}

function SatelliteFeedForm({
  feed,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  feed: SatelliteFeed | null
  busy: boolean
  error: string | null
  onSubmit: (values: SatelliteFeedFormValues) => void
  onCancel: () => void
}) {
  const [feedUrl, setFeedUrl] = useState(feed?.feedUrl ?? "")
  // Starts where the feed already stands. Switching off clears the stored password, so a
  // form that always opened off would wipe a working one the moment someone edited only
  // the URL — and the paddler would go to sea believing they were being tracked.
  const [setPassword, setSetPassword] = useState(feed?.hasPassword ?? false)
  const [feedPassword, setFeedPassword] = useState("")

  function submit() {
    onSubmit({
      provider: feed?.provider ?? SATELLITE_PROVIDER.INREACH_MAPSHARE,
      feedUrl,
      setPassword,
      feedPassword,
      hasStoredPassword: feed?.hasPassword ?? false,
    })
  }

  return (
    <Stack className="gap-4">
      <Stack className="gap-1">
        <Label>Feed URL</Label>
        <Input
          value={feedUrl}
          onChangeText={setFeedUrl}
          placeholder="https://share.garmin.com/feed/Share/yourname"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          testID="satellite-url"
        />
        <Text className="text-xs text-muted-foreground">
          From your Garmin MapShare page. It must be public, or set the password below.
        </Text>
      </Stack>

      <Stack className="gap-1">
        <Row className="items-center gap-2">
          <Switch
            value={setPassword}
            onValueChange={setSetPassword}
            accessibilityLabel="Set a MapShare password"
            testID="satellite-password-switch"
          />
          <Label>Set a MapShare password</Label>
        </Row>
        {/* Turning the switch off removes the stored password, so say so before the save
            rather than after it. Only a feed that has one can lose one. */}
        {feed?.hasPassword && !setPassword ? (
          <Text className="text-sm text-destructive">
            Saving will remove the stored password. The feed is then only polled if your
            MapShare page is public.
          </Text>
        ) : (
          <Text className="text-xs text-muted-foreground">
            Only if your MapShare page is password-protected.
          </Text>
        )}
      </Stack>

      {setPassword && (
        <Stack className="gap-1">
          <Label>MapShare password</Label>
          <Input
            value={feedPassword}
            onChangeText={setFeedPassword}
            placeholder={feed?.hasPassword ? "Unchanged" : undefined}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="satellite-password"
          />
          {feed?.hasPassword && (
            <Text className="text-xs text-muted-foreground">
              Leave blank to keep the password you saved before.
            </Text>
          )}
        </Stack>
      )}

      {error && <Text className="text-sm text-destructive">{error}</Text>}

      <Row className="gap-2">
        <Button onPress={submit} disabled={busy} testID="satellite-save">
          {busy ? "Saving…" : "Save feed"}
        </Button>
        <Button variant="outline" onPress={onCancel} testID="satellite-cancel">
          Cancel
        </Button>
      </Row>
    </Stack>
  )
}
