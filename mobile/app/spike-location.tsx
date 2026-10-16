// M9e WP0 spike screen (plans/M9e.md): throwaway. Open it with
//   adb shell am start -a android.intent.action.VIEW -d "kayaktrek:///spike-location"
// start sharing, lock the phone and walk. The numbers below come from the file the background
// task writes, so they are what really arrived while the screen was off.

import { useCallback, useEffect, useState } from "react"
import { ScrollView, Text } from "react-native"

import { Button } from "../components/ui/button"
import { Row, Screen, Stack } from "../components/ui/layout"
import { parseLog, summarise, type SpikeSummary } from "../lib/spike/location-log"
import {
  PRESETS,
  clearLog,
  ensureForegroundPermission,
  isSharing,
  readLog,
  startSharing,
  stopSharing,
} from "../lib/spike/location-task"

const REFRESH_MS = 5_000

function clock(ms: number | null): string {
  return ms === null ? "-" : new Date(ms).toLocaleTimeString()
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 120 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

export default function SpikeLocationScreen() {
  const [permission, setPermission] = useState<string>("not asked")
  const [presetIndex, setPresetIndex] = useState(0)
  const [killOnDestroy, setKillOnDestroy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [summary, setSummary] = useState<SpikeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSharing(await isSharing())
    const preset = PRESETS[presetIndex]
    setSummary(summarise(parseLog(readLog()), preset.timeIntervalMs * 3))
  }, [presetIndex])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set inside refresh's async body
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  async function run(action: () => Promise<void> | void) {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
    await refresh()
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Text className="text-lg font-semibold text-foreground">M9e spike: does sharing survive a locked screen?</Text>

        <Stack>
          <Text className="text-muted-foreground">Location permission: {permission}</Text>
          <Button
            variant="outline"
            onPress={() => run(async () => setPermission(await ensureForegroundPermission()))}
          >
            Ask for location permission
          </Button>
        </Stack>

        <Stack>
          <Text className="text-muted-foreground">Settings</Text>
          {PRESETS.map((preset, index) => (
            <Button
              key={preset.label}
              variant={index === presetIndex ? "default" : "outline"}
              disabled={sharing}
              onPress={() => setPresetIndex(index)}
            >
              {preset.label}
            </Button>
          ))}
          <Button variant={killOnDestroy ? "default" : "outline"} disabled={sharing} onPress={() => setKillOnDestroy(!killOnDestroy)}>
            {killOnDestroy ? "Service stops when the app is swiped away" : "Service survives the app being swiped away"}
          </Button>
        </Stack>

        <Row>
          <Button disabled={sharing} onPress={() => run(() => startSharing(PRESETS[presetIndex], killOnDestroy))}>
            Start
          </Button>
          <Button variant="destructive" disabled={!sharing} onPress={() => run(stopSharing)}>
            Stop
          </Button>
          <Button variant="outline" onPress={() => run(clearLog)}>
            Clear log
          </Button>
        </Row>

        {error ? <Text className="text-destructive">{error}</Text> : null}

        <Stack>
          <Text className="font-semibold text-foreground">Service: {sharing ? "RUNNING" : "stopped"}</Text>
          {summary ? (
            <>
              <Text className="text-foreground">Fixes logged: {summary.count}</Text>
              <Text className="text-foreground">
                First {clock(summary.firstAt)}, last {clock(summary.lastAt)}, span {duration(summary.spanMs)}
              </Text>
              <Text className="text-foreground">
                Median gap {duration(summary.medianGapMs)}, longest gap {duration(summary.longestGapMs)}
                {summary.longestGapEndedAt ? ` (ended ${clock(summary.longestGapEndedAt)})` : ""}
              </Text>
              <Text className="text-foreground">
                Gaps over {duration(PRESETS[presetIndex].timeIntervalMs * 3)}: {summary.gapsOverThreshold}
              </Text>
              <Text className="text-foreground">
                Worst delay between a fix and its delivery: {duration(summary.maxDeliveryDelayMs)}
              </Text>
            </>
          ) : null}
        </Stack>
      </ScrollView>
    </Screen>
  )
}
