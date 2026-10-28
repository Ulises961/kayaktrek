import * as Location from "expo-location"

import { logEvent } from "../../spike/events"
import { keepAliveDue } from "./keep-alive"
import { deliver, ensureRunning, fixFromLocation, type EngineDeps } from "./position-engine"
import { sendPositionPing } from "./position-sender"
import { getSharingRecord, updateSharingRecord } from "./sharing-state"
import type { PositionFix } from "./types"
import { unregisterWatchdog } from "./watchdog-schedule"

const FIX_TIMEOUT_MS = 30_000

export type WatchdogDeps = EngineDeps & { currentFix: () => Promise<PositionFix | null> }

async function currentFix(): Promise<PositionFix | null> {
  try {
    const location = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no fix in time")), FIX_TIMEOUT_MS)),
    ])
    return fixFromLocation(location)
  } catch {
    return null
  }
}

const liveDeps: WatchdogDeps = { now: Date.now, send: sendPositionPing, log: logEvent, currentFix }

// The keep-alive (plans/M9e.md WP1), run by the work scheduler about hourly. It first makes sure the
// location service is still alive, then, if no ping has gone out lately, sends one fresh fix so that
// a phone sitting still is not read as a phone that has gone quiet.
export async function runWatchdog(deps: WatchdogDeps = liveDeps): Promise<void> {
  const now = deps.now()
  const record = getSharingRecord()
  if (record === null || record.endedReason !== null) {
    deps.log({ ev: "watchdog", t: now, outcome: "no-share", sinceLastWakeMs: null })
    await unregisterWatchdog()
    return
  }

  const sinceLastWakeMs = record.lastWakeAt === null ? null : now - record.lastWakeAt
  await ensureRunning("watchdog", deps)
  updateSharingRecord({ lastWakeAt: now })

  if (!keepAliveDue(record.lastSentAt, now)) {
    deps.log({ ev: "watchdog", t: now, outcome: "recent", sinceLastWakeMs })
    return
  }
  const fix = await deps.currentFix()
  if (fix === null) {
    deps.log({ ev: "watchdog", t: now, outcome: "no-fix", sinceLastWakeMs })
    return
  }
  const outcome = await deliver(fix, "keep-alive", deps)
  const result = outcome?.kind === "sent" ? "sent" : outcome?.kind === "stop" ? "stopped" : "failed"
  deps.log({ ev: "watchdog", t: now, outcome: result, sinceLastWakeMs })
}
