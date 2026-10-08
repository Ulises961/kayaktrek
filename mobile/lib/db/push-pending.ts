import { type PushResult, registerPushRetry, setPushStatus } from "../network/push-status"
import { pushQueuedMutations } from "./mutation-queue"
import { pushRouteChanges, tripsWithRouteChanges } from "./route-edit"

// The one way anything on this phone gets sent (M9d follow-up). Edits used to
// push themselves one screen at a time — some after their write, some not — so a
// drag never left the phone until the next foreground, and one failed attempt at
// the moment of reconnecting was never retried. Everything now goes through here:
// routes first (a queued change can point at a point only the route push creates
// on the server), then the queue, one push in the air at a time.

// Waits before each automatic retry after a failure. Past the last, it stops and
// leaves it to the next sweep (foreground or reconnect) or the paddler's own
// retry — a phone with no signal should not wake itself forever.
export const RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const

let inFlight: Promise<PushResult> | null = null
let rerunRequested = false
let retryAttempt = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function clearRetryTimer() {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
}

// A parked route conflict is not a failure: retrying cannot resolve it, only the
// leader's decision can, so it would only burn the schedule.
async function pushOnce(): Promise<PushResult> {
  let failed = false
  try {
    for (const tripId of await tripsWithRouteChanges()) {
      await pushRouteChanges(tripId).catch(() => {
        failed = true
      })
    }
  } catch {
    failed = true
  }
  await pushQueuedMutations().catch(() => {
    failed = true
  })
  return failed ? "failed" : "sent"
}

function scheduleRetry() {
  clearRetryTimer()
  if (retryAttempt >= RETRY_DELAYS_MS.length) {
    setPushStatus({ state: "failed", retryAt: null })
    return
  }
  const delay = RETRY_DELAYS_MS[retryAttempt]
  retryAttempt += 1
  setPushStatus({ state: "failed", retryAt: Date.now() + delay })
  retryTimer = setTimeout(() => {
    retryTimer = null
    void pushPending()
  }, delay)
}

/**
 * Send everything this phone has not sent. Never rejects: failing offline is the
 * expected case, and callers fire this without waiting. A request made while a
 * push is in the air is not dropped — it gets a second pass, so an edit made
 * mid-push does not wait for the next trigger.
 */
export function pushPending(): Promise<PushResult> {
  if (inFlight) {
    rerunRequested = true
    return inFlight
  }
  inFlight = (async () => {
    setPushStatus({ state: "pushing", retryAt: null })
    let result: PushResult
    do {
      rerunRequested = false
      result = await pushOnce()
    } while (rerunRequested)
    inFlight = null
    if (result === "sent") {
      retryAttempt = 0
      clearRetryTimer()
      setPushStatus({ state: "idle", retryAt: null })
    } else {
      scheduleRetry()
    }
    return result
  })()
  return inFlight
}

/** Fire-and-forget, for the code that has just written something locally. */
export function requestPush(): void {
  void pushPending()
}

/**
 * The paddler's own retry. Restarts the schedule, so a failure here re-arms the
 * automatic retries instead of going quiet after one attempt — and cancels one
 * already waiting, so the two never fire together.
 */
export function retryPushNow(): Promise<PushResult> {
  clearRetryTimer()
  retryAttempt = 0
  return pushPending()
}

// The offline banner's button lives in a module that must not import this one
// (it would drag the database into every screen); it reaches the retry here.
registerPushRetry(retryPushNow)
