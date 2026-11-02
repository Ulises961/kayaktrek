// M9e WP1 (plans/M9e.md): sharing the paddler's position. An Android foreground service delivers
// fixes to `handleFixes`; the shared throttle decides which become pings; `deliver` sends one and acts
// on the answer. The same code runs a practice share that sends nothing, so a condition can be
// exercised without a trip under way. Every step writes to the evidence log (lib/spike/events.ts), so
// what the phone did while the screen was off is on record.

import { shouldSendPing, type PingAnchor } from "@shared/live/ping-throttle"
import * as Location from "expo-location"

import { logEvent } from "../../spike/events"
import type { SpikeEvent } from "../../spike/run-report"
import { sendPositionPing } from "./position-sender"
import { getSharingRecord, setSharingRecord, updateSharingRecord } from "./sharing-state"
import {
  POSITION_TASK,
  STOP_REASON,
  type PingSource,
  type PositionFix,
  type SendOutcome,
  type SharingTarget,
  type StopReason,
} from "./types"
import { registerWatchdog, unregisterWatchdog } from "./watchdog-schedule"

export { POSITION_TASK }

const FIX_INTERVAL_MS = 15_000
const FIX_DISTANCE_M = 10

export type EngineDeps = {
  now: () => number
  send: (tripId: string, fix: PositionFix) => Promise<SendOutcome>
  log: (event: SpikeEvent) => void
}

const liveDeps: EngineDeps = { now: Date.now, send: sendPositionPing, log: logEvent }

export type StartFailure = "permission" | "location-off" | "start-failed"

export class SharingStartError extends Error {
  constructor(
    readonly reason: StartFailure,
    message: string,
  ) {
    super(message)
    this.name = "SharingStartError"
  }
}

// Where the last ping went, for the throttle. Held in memory only: a restarted process sends its first
// fix at once, which is the right thing to do, and no coordinates are written to disk.
let anchor: PingAnchor | null = null
// What this process last saw of the system location switch, and whether it saw it off since the task
// was registered. Android may not revive a task that was registered while the switch was off.
let lastSwitchOn: boolean | null = null
let sawSwitchOff = false

export function resetEngineForTests(): void {
  anchor = null
  lastSwitchOn = null
  sawSwitchOff = false
}

export function fixFromLocation(location: Location.LocationObject): PositionFix {
  const { latitude, longitude, accuracy, heading, speed } = location.coords
  return {
    lat: latitude,
    lon: longitude,
    accuracyM: accuracy ?? null,
    // Android reports -1 for "no heading" and "no speed".
    headingDeg: heading !== null && heading >= 0 ? heading : null,
    speedMs: speed !== null && speed >= 0 ? speed : null,
    timestamp: location.timestamp,
  }
}

function markSent(fix: PositionFix, at: number): void {
  anchor = { lat: fix.lat, lon: fix.lon, at }
  updateSharingRecord({ lastSentAt: at, lastFailure: null })
}

// Sends one ping to the current share and acts on the answer. Returns null when there is no share.
export async function deliver(
  fix: PositionFix,
  source: PingSource,
  deps: EngineDeps = liveDeps,
): Promise<SendOutcome | null> {
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) return null
  const now = deps.now()

  if (record.target.kind === "practice") {
    markSent(fix, now)
    deps.log({ ev: "ping", t: now, source, outcome: "practice", detail: null })
    return { kind: "sent" }
  }

  const outcome = await deps.send(record.target.tripId, fix)
  switch (outcome.kind) {
    case "sent":
      markSent(fix, now)
      deps.log({ ev: "ping", t: now, source, outcome: "sent", detail: null })
      break
    case "retry":
      updateSharingRecord({ lastFailure: { at: now, reason: outcome.reason } })
      deps.log({ ev: "ping", t: now, source, outcome: "retry", detail: outcome.reason })
      break
    case "stop":
      deps.log({ ev: "ping", t: now, source, outcome: "stop", detail: outcome.reason })
      await stopSharing(outcome.reason, deps)
      break
  }
  return outcome
}

// The location task's body: every fix is evidence, and the throttle picks the ones to send.
export async function handleFixes(locations: Location.LocationObject[], deps: EngineDeps = liveDeps): Promise<void> {
  const receivedAt = deps.now()
  for (const location of locations) {
    const fix = fixFromLocation(location)
    deps.log({
      ev: "fix",
      t: fix.timestamp,
      rx: receivedAt,
      lat: fix.lat,
      lon: fix.lon,
      accuracyM: fix.accuracyM,
      speedMs: fix.speedMs,
    })
  }

  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) {
    // A registration that outlived its share, for instance one the task manager re-armed on launch.
    deps.log({ ev: "error", t: receivedAt, message: "fix with no sharing record, stopping the task" })
    await stopTask(deps)
    return
  }
  updateSharingRecord({ lastFixAt: receivedAt })

  for (const location of locations) {
    const fix = fixFromLocation(location)
    if (!shouldSendPing(anchor, fix, deps.now())) continue
    await deliver(fix, "movement", deps)
  }
}

async function stopTask(deps: EngineDeps): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(POSITION_TASK)) {
      await Location.stopLocationUpdatesAsync(POSITION_TASK)
    }
  } catch (error) {
    deps.log({ ev: "error", t: deps.now(), message: `stop failed: ${errorText(error)}` })
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerTask(target: SharingTarget): Promise<void> {
  return Location.startLocationUpdatesAsync(POSITION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: FIX_INTERVAL_MS,
    distanceInterval: FIX_DISTANCE_M,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Kayaktrek",
      notificationBody:
        target.kind === "trip" ? "Sharing your position with the crew" : "Practice share: nothing is sent",
      // The service outlives the app being swiped away (measured on the Mi 8, plans/M9e.md WP0).
      killServiceOnDestroy: false,
    },
  })
}

export async function startSharing(target: SharingTarget, deps: EngineDeps = liveDeps): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  deps.log({ ev: "perm", t: deps.now(), status })
  if (status !== "granted") {
    throw new SharingStartError("permission", "Location permission is needed to share your position.")
  }
  // The app permission is not the system switch. A service registered while the switch is off looks
  // healthy and delivers nothing, so refuse here and say so.
  const switchOn = await Location.hasServicesEnabledAsync()
  noteSwitch(switchOn, deps)
  if (!switchOn) {
    throw new SharingStartError(
      "location-off",
      "Location is switched off on this phone. Switch it on from the quick settings, then start sharing.",
    )
  }

  const now = deps.now()
  anchor = null
  sawSwitchOff = false
  setSharingRecord({
    target,
    startedAt: now,
    lastSentAt: null,
    lastFixAt: null,
    lastWakeAt: null,
    lastFailure: null,
    endedReason: null,
  })
  // Logged first, so that every fix of the run falls after its marker.
  deps.log({ ev: "run-start", t: now, label: target.kind === "trip" ? "Trip share" : "Practice share", killOnDestroy: false })
  try {
    await registerTask(target)
    await registerWatchdog()
  } catch (error) {
    deps.log({ ev: "error", t: deps.now(), message: `start failed: ${errorText(error)}` })
    setSharingRecord(null)
    throw new SharingStartError("start-failed", "Sharing could not be started.")
  }
}

export async function stopSharing(reason: StopReason, deps: EngineDeps = liveDeps): Promise<void> {
  deps.log({ ev: "run-stop", t: deps.now(), reason })
  await stopTask(deps)
  await unregisterWatchdog()
  anchor = null
  if (reason === STOP_REASON.USER) {
    setSharingRecord(null)
  } else {
    updateSharingRecord({ endedReason: reason })
  }
}

function noteSwitch(on: boolean, deps: EngineDeps): void {
  if (lastSwitchOn !== on) {
    deps.log({ ev: "locsw", t: deps.now(), on, source: "js" })
    lastSwitchOn = on
  }
  if (!on) sawSwitchOff = true
}

export type EnsureTrigger = "launch" | "foreground" | "watchdog"

// Brings a running share back to a working state. Called when the app opens, comes to the foreground
// and on every watchdog wake, because the task can be gone (the process was killed) or dead on
// arrival (registered while the system location switch was off).
export async function ensureRunning(trigger: EnsureTrigger, deps: EngineDeps = liveDeps): Promise<void> {
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) return

  const switchOn = await Location.hasServicesEnabledAsync()
  noteSwitch(switchOn, deps)
  if (!switchOn) return

  const started = await Location.hasStartedLocationUpdatesAsync(POSITION_TASK)
  const baseline = record.lastWakeAt ?? record.startedAt
  let reason: string | null = null
  if (!started) reason = "task-missing"
  else if (sawSwitchOff) reason = "switch-back-on"
  else if (trigger === "watchdog" && (record.lastFixAt === null || record.lastFixAt < baseline)) {
    reason = "no-fix-since-last-wake"
  }
  if (reason === null) return

  deps.log({ ev: "reregister", t: deps.now(), reason })
  try {
    if (started) await Location.stopLocationUpdatesAsync(POSITION_TASK)
    await registerTask(record.target)
    sawSwitchOff = false
  } catch (error) {
    deps.log({ ev: "error", t: deps.now(), message: `re-register failed: ${errorText(error)}` })
  }
}
