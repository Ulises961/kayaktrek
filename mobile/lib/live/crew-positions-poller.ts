import { LivePositionsPageSchema, type LivePosition } from "@shared/dtos/live-position"

// Polls a trip's newest crew positions (M9e WP2). React Native has no `EventSource`, so this is the
// crew stream's replacement: pings arrive at most every 15 s, and a 10 s poll shows nearly the same
// freshness. The ticket, 404 and back-off handling follow `@shared/live/trip-changes-poller`.

export type CrewPositionsStatus = "connecting" | "live" | "ended" | "error"

export type CrewPositionsPollerOptions = {
  // A poll URL with its ticket, e.g. `…/positions?ticket=…`; minted again whenever the ticket is about
  // to expire. `null` means the server refused: the viewer is no longer on the trip. Throwing means
  // "try again later".
  mintUrl: () => Promise<string | null>
  onPositions: (positions: LivePosition[]) => void
  onStatus?: (status: CrewPositionsStatus) => void
  // Whether polling is wanted right now (app foregrounded). Defaults to yes.
  startActive?: boolean
  intervalMs?: number
  fetchImpl?: typeof fetch
}

export const DEFAULT_POSITIONS_INTERVAL_MS = 10_000
// Tickets live five minutes on the server; this one is replaced a minute early so a poll is never
// the first to find out.
const TICKET_REUSE_MS = 4 * 60 * 1000
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 60_000
const MAX_RETRY_AFTER_MS = 120_000

type Outcome = { delayMs: number; retryNow?: boolean }

export function createCrewPositionsPoller(options: CrewPositionsPollerOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_POSITIONS_INTERVAL_MS
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  let active = options.startActive ?? true
  let stopped = false
  let started = false
  let status: CrewPositionsStatus = "connecting"
  let ticketUrl: string | null = null
  let ticketMintedAt = 0
  let backoffMs = BASE_BACKOFF_MS
  let wake: (() => void) | null = null
  const inFlight = new AbortController()

  function setStatus(next: CrewPositionsStatus) {
    if (next === status || stopped) return
    status = next
    options.onStatus?.(next)
  }

  // Resolves when the time is up or something calls `wake` (resuming, stopping).
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        wake = null
        resolve()
      }
      wake = done
    })
  }

  function waitUntilWoken(): Promise<void> {
    return new Promise((resolve) => {
      wake = () => {
        wake = null
        resolve()
      }
    })
  }

  function failureDelay() {
    const delay = backoffMs
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    setStatus("error")
    return delay
  }

  function retryAfterMs(response: Response): number | null {
    const seconds = Number(response.headers.get("Retry-After"))
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  }

  async function pollOnce(): Promise<Outcome> {
    let mintedThisPoll = false
    if (ticketUrl === null || Date.now() - ticketMintedAt >= TICKET_REUSE_MS) {
      let minted: string | null
      try {
        minted = await options.mintUrl()
      } catch {
        return { delayMs: failureDelay() }
      }
      if (stopped) return { delayMs: 0 }
      if (minted === null) {
        setStatus("ended")
        stopped = true
        return { delayMs: 0 }
      }
      ticketUrl = minted
      ticketMintedAt = Date.now()
      mintedThisPoll = true
    }

    let response: Response
    try {
      response = await fetchImpl(ticketUrl, { cache: "no-store", signal: inFlight.signal })
    } catch {
      return { delayMs: failureDelay() }
    }
    if (stopped) return { delayMs: 0 }

    if (response.status === 404) {
      // Either the ticket has expired, or the viewer is off the trip, or the trip is no longer under
      // way. A ticket minted for this very poll cannot have expired, so that settles which.
      if (mintedThisPoll) {
        setStatus("ended")
        stopped = true
        return { delayMs: 0 }
      }
      ticketUrl = null
      return { delayMs: 0, retryNow: true }
    }
    if (response.status === 429 || response.status === 503) {
      const asked = retryAfterMs(response)
      setStatus("error")
      return { delayMs: asked ?? Math.max(intervalMs, failureDelay()) }
    }
    if (!response.ok) return { delayMs: failureDelay() }

    const parsed = LivePositionsPageSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) return { delayMs: failureDelay() }
    if (stopped) return { delayMs: 0 }

    backoffMs = BASE_BACKOFF_MS
    setStatus("live")
    options.onPositions(parsed.data.positions)
    return { delayMs: intervalMs }
  }

  async function run() {
    while (!stopped) {
      if (!active) {
        await waitUntilWoken()
        continue
      }
      const outcome = await pollOnce()
      if (stopped) return
      if (outcome.retryNow) continue
      await sleep(outcome.delayMs)
    }
  }

  return {
    start() {
      if (started) return
      started = true
      options.onStatus?.(status)
      void run()
    },
    // Pausing lets the request in flight finish, then waits; resuming polls at once, so an app
    // coming back to the foreground shows where everyone is now.
    setActive(next: boolean) {
      active = next
      wake?.()
    },
    stop() {
      stopped = true
      inFlight.abort()
      wake?.()
    },
  }
}
