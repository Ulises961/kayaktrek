// M9e WP0 spike screen (plans/M9e.md): throwaway. Start sharing, lock the phone and walk. The report
// below is built from the evidence log the app and the phone wrote while the screen was off, so it
// is what really happened. Nothing here needs a cable, and nothing here can clear the log.

import { useCallback, useEffect, useState } from "react"
import { ScrollView, Share, Text } from "react-native"

import { Button } from "../components/ui/button"
import { Row, Screen, Stack } from "../components/ui/layout"
import { deviceSnapshot, type DeviceSnapshot } from "../modules/spike-device-events"
import { readAllLogText } from "../lib/spike/events"
import {
  PRESETS,
  currentPermission,
  ensureForegroundPermission,
  isSharing,
  startSharing,
  stopSharing,
} from "../lib/spike/location-task"
import { clock, duration, formatEvent, formatReport } from "../lib/spike/report-format"
import { parseEvents, reportRuns, type RunReport, type SpikeEvent } from "../lib/spike/run-report"

const REFRESH_MS = 5_000
const RECENT_SHOWN = 25
const RECENT_SHARED = 80

const STANDBY_BUCKETS: Record<number, string> = {
  10: "active",
  20: "working set",
  30: "frequent",
  40: "rare",
  45: "restricted",
}

function phoneLines(phone: DeviceSnapshot | null): string[] {
  if (!phone) return ["Phone: no reading"]
  const bucket = phone.standbyBucket === null ? "?" : `${phone.standbyBucket} (${STANDBY_BUCKETS[phone.standbyBucket] ?? "other"})`
  return [
    `Phone: ${phone.manufacturer} ${phone.model}, Android API ${phone.sdk}`,
    `Screen ${phone.interactive ? "on" : "off"}, deep sleep ${phone.idle ? "ON" : "off"}, battery saver ${phone.powerSave ? "ON" : "off"}`,
    `Battery ${phone.battery}%${phone.charging ? " charging" : ""}, standby bucket ${bucket}`,
    `Exempt from battery optimisation: ${phone.ignoringBatteryOptimizations ? "yes" : "no"}`,
  ]
}

function earlierRunLine(report: RunReport): string {
  return `${clock(report.startedAt)}  ${report.label}: ${report.fixes.count} fixes, ${duration(report.endedAt - report.startedAt)}`
}

function shareText(reports: RunReport[], recent: SpikeEvent[], phone: DeviceSnapshot | null): string {
  const newestFirst = [...reports].reverse()
  return [
    "M9e spike report",
    ...phoneLines(phone),
    "",
    ...newestFirst.map((report) => formatReport(report)).join("\n\n").split("\n"),
    "",
    `Last ${RECENT_SHARED} events, newest first:`,
    ...recent.slice(0, RECENT_SHARED).map(formatEvent),
  ].join("\n")
}

export default function SpikeLocationScreen() {
  const [permission, setPermission] = useState("checking")
  const [presetIndex, setPresetIndex] = useState(0)
  const [killOnDestroy, setKillOnDestroy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [reports, setReports] = useState<RunReport[]>([])
  const [events, setEvents] = useState<SpikeEvent[]>([])
  const [phone, setPhone] = useState<DeviceSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSharing(await isSharing())
    const parsed = parseEvents(readAllLogText())
    setEvents(parsed)
    setReports(reportRuns(parsed))
    try {
      setPhone(deviceSnapshot())
    } catch {
      setPhone(null)
    }
  }, [])

  useEffect(() => {
    void currentPermission().then(setPermission)
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

  const recent = [...events].reverse()
  const latest = reports.length > 0 ? reports[reports.length - 1] : null
  const earlier = reports.slice(0, -1).reverse()

  return (
    <Screen>
      {/* One style object: a contentContainerStyle replaces the class-based one, so the page padding
          and the clearance for the floating "spike" link have to be set together. */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 160 }}>
        <Text className="text-lg font-semibold text-foreground">M9e spike: does sharing survive a locked screen?</Text>
        <Text className="text-muted-foreground">
          Tap Start, lock the phone, walk 30 minutes or more with it in a pocket, and do not open the app. Then
          open it and read the report, or tap Share report. Nothing here needs a cable and nothing can clear the
          log.
        </Text>

        <Stack>
          <Text className="text-muted-foreground">Location permission: {permission}</Text>
          <Button
            variant="outline"
            onPress={() =>
              run(async () => {
                setPermission(await ensureForegroundPermission())
              })
            }
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
          <Button variant="outline" onPress={() => run(() => Share.share({ message: shareText(reports, recent, phone) }).then(() => undefined))}>
            Share report
          </Button>
        </Row>

        {error ? <Text className="text-destructive">{error}</Text> : null}

        <Stack>
          <Text className="font-semibold text-foreground">Location service: {sharing ? "RUNNING" : "stopped"}</Text>
          <Text selectable style={{ fontFamily: "monospace", fontSize: 12 }} className="text-foreground">
            {phoneLines(phone).join("\n")}
          </Text>
        </Stack>

        <Stack>
          <Text className="font-semibold text-foreground">Latest run</Text>
          {latest ? (
            <Text selectable style={{ fontFamily: "monospace", fontSize: 12 }} className="text-foreground">
              {formatReport(latest)}
            </Text>
          ) : (
            <Text className="text-muted-foreground">No run yet. Tap Start.</Text>
          )}
        </Stack>

        {earlier.length > 0 ? (
          <Stack>
            <Text className="font-semibold text-foreground">Earlier runs</Text>
            <Text selectable style={{ fontFamily: "monospace", fontSize: 12 }} className="text-foreground">
              {earlier.map(earlierRunLine).join("\n")}
            </Text>
          </Stack>
        ) : null}

        <Stack>
          <Text className="font-semibold text-foreground">Recent events, newest first</Text>
          <Text selectable style={{ fontFamily: "monospace", fontSize: 11 }} className="text-foreground">
            {recent.slice(0, RECENT_SHOWN).map(formatEvent).join("\n") || "none yet"}
          </Text>
        </Stack>
      </ScrollView>
    </Screen>
  )
}
