// M9e WP1 (the M9e plan): sharing the paddler's position. An Android foreground service delivers
// fixes to `handleFixes`; the shared throttle decides which become pings; `deliver` sends one and acts
// on the answer.

import { shouldSendPing, type PingAnchor } from "@shared/live/ping-throttle"
import * as Location from "expo-location"

import { bufferPing, bufferedPingCount, discardBufferedPings } from "../../db/position-buffer"
import { requestPush } from "../../db/push-pending"
import { sendPositionPing } from "./position-sender"
import { getSharingRecord, setSharingRecord, updateSharingRecord } from "./sharing-state"
import {
  POSITION_TASK,
  SEND_FAILURE,
  STOP_REASON,
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
}

const liveDeps: EngineDeps = { now: Date.now, send: sendPositionPing }

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
// Whether this process saw the system location switch off since the task was registered. Android may
// not revive a task that was registered while the switch was off.
let sawSwitchOff = false

export function resetEngineForTests(): void {
  anchor = null
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
export async function deliver(fix: PositionFix, deps: EngineDeps = liveDeps): Promise<SendOutcome | null> {
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) return null
  const now = deps.now()

  const { tripId } = record.target
  const outcome = await deps.send(tripId, fix)
  switch (outcome.kind) {
    case "sent":
      markSent(fix, now)
      await sendWhatWasKept()
      break
    case "retry":
      updateSharingRecord({ lastFailure: { at: now, reason: outcome.reason } })
      // A ping the server refused as invalid would be refused again; any other failure is a gap in
      // the track unless the fix is kept for later.
      if (outcome.reason !== SEND_FAILURE.REJECTED) await keepForTheTrack(tripId, fix)
      break
    case "stop":
      await stopSharing(outcome.reason)
      await forgetWhatWasKept(tripId)
      break
  }
  return outcome
}

// The buffer is a best effort beside the share: when it cannot be read or written the share carries
// on, and the track has a gap, as it did before there was a buffer.
async function keepForTheTrack(tripId: string, fix: PositionFix): Promise<void> {
  try {
    await bufferPing(tripId, fix)
  } catch {
    // Nothing to do: this fix is lost to the track.
  }
}

// Called when a ping got through: there is signal, so whatever was kept can go too.
async function sendWhatWasKept(): Promise<void> {
  try {
    if ((await bufferedPingCount()) > 0) requestPush()
  } catch {
    // Nothing to do: the next ping that gets through asks again.
  }
}

// The trip is over for this paddler, so what was kept for it can never be sent.
async function forgetWhatWasKept(tripId: string): Promise<void> {
  try {
    await discardBufferedPings(tripId)
  } catch {
    // Nothing to do: the next push is refused the same way and discards them then.
  }
}

// The location task's body: the throttle picks the fixes to send.
export async function handleFixes(locations: Location.LocationObject[], deps: EngineDeps = liveDeps): Promise<void> {
  const receivedAt = deps.now()
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) {
    // A registration that outlived its share, for instance one the task manager re-armed on launch.
    await stopTask()
    return
  }
  updateSharingRecord({ lastFixAt: receivedAt })

  for (const location of locations) {
    const fix = fixFromLocation(location)
    if (!shouldSendPing(anchor, fix, deps.now())) continue
    await deliver(fix, deps)
  }
}

async function stopTask(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(POSITION_TASK)) {
      await Location.stopLocationUpdatesAsync(POSITION_TASK)
    }
  } catch {
    // Nothing to do here: a service that would not stop delivers its next fix to `handleFixes`, which
    // finds no share and stops it again.
  }
}

function registerTask(): Promise<void> {
  return Location.startLocationUpdatesAsync(POSITION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: FIX_INTERVAL_MS,
    distanceInterval: FIX_DISTANCE_M,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Kayaktrek",
      notificationBody: "Sharing your position with the crew",
      // The service outlives the app being swiped away (measured on the Mi 8, the M9e plan, WP0).
      killServiceOnDestroy: false,
    },
  })
}

export async function startSharing(target: SharingTarget, deps: EngineDeps = liveDeps): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== "granted") {
    throw new SharingStartError("permission", "Location permission is needed to share your position.")
  }
  // The app permission is not the system switch. A service registered while the switch is off looks
  // healthy and delivers nothing, so refuse here and say so.
  if (!(await Location.hasServicesEnabledAsync())) {
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
  try {
    await registerTask()
    await registerWatchdog()
  } catch {
    setSharingRecord(null)
    throw new SharingStartError("start-failed", "Sharing could not be started.")
  }
}

export async function stopSharing(reason: StopReason): Promise<void> {
  await stopTask()
  await unregisterWatchdog()
  anchor = null
  if (reason === STOP_REASON.USER) {
    setSharingRecord(null)
  } else {
    updateSharingRecord({ endedReason: reason })
  }
}

export type EnsureTrigger = "launch" | "foreground" | "watchdog"

// Brings a running share back to a working state. Called when the app opens, comes to the foreground
// and on every watchdog wake, because the task can be gone (the process was killed) or dead on
// arrival (registered while the system location switch was off).
export async function ensureRunning(trigger: EnsureTrigger): Promise<void> {
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) return

  if (!(await Location.hasServicesEnabledAsync())) {
    sawSwitchOff = true
    return
  }

  const started = await Location.hasStartedLocationUpdatesAsync(POSITION_TASK)
  const baseline = record.lastWakeAt ?? record.startedAt
  const noFixSinceLastWake =
    trigger === "watchdog" && (record.lastFixAt === null || record.lastFixAt < baseline)
  if (started && !sawSwitchOff && !noFixSinceLastWake) return

  try {
    if (started) await Location.stopLocationUpdatesAsync(POSITION_TASK)
    await registerTask()
    sawSwitchOff = false
  } catch {
    // Nothing to do here: the next return to the foreground or the next keep-alive wake tries again.
  }
}
