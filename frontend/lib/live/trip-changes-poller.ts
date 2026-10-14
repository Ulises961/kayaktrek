import { TripChangesPageSchema, type TripChange } from "../dtos/trip-change"

// Polls a trip's change log (M36) and reports what other people changed. The one place that
// knows the protocol, shared by the web hook and the mobile hub (imported there as
// `@shared/live/trip-changes-poller`), so it is plain TypeScript with no framework imports.
//
// A change is a hint, never data: the caller refetches through its normal read path.

export type TripChangesStatus = "connecting" | "live" | "ended" | "error"

export type TripChangesPollerOptions = {
  // A poll URL with its ticket and no cursor, e.g. `…/changes?ticket=…`; the poller appends
  // `&since=`. Minted again whenever the ticket is about to expire. `null` means the server
  // refused: the viewer is no longer on the trip. Throwing means "try again later".
  mintUrl: () => Promise<string | null>
  // Something the viewer may be showing has changed. An empty list means *something* has but
  // the exact changes are unknown, so refresh everything.
  onChange: (changes: TripChange[]) => void
  onStatus?: (status: TripChangesStatus) => void
  // The revision the viewer's data was read at. Omit to take the first poll as the baseline.
  since?: number | null
  // Whether polling is wanted right now (tab visible, app foregrounded). Defaults to yes.
  startActive?: boolean
  intervalMs?: number
  fetchImpl?: typeof fetch
  random?: () => number
}

export const DEFAULT_POLL_INTERVAL_MS = 7000
// The first poll comes soon after the page renders, to pick up anything that landed between
// the data being read and the poller starting.
const FIRST_POLL_MAX_DELAY_MS = 1000
// Tickets live five minutes on the server; this one is replaced a minute early so a poll is
// never the first to find out.
const TICKET_REUSE_MS = 4 * 60 * 1000
const BASE_BACKOFF_MS = 5000
const MAX_BACKOFF_MS = 60_000
const MAX_RETRY_AFTER_MS = 120_000
const JITTER = 0.2

type Outcome = { delayMs: number; retryNow?: boolean }

export function createTripChangesPoller(options: TripChangesPollerOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const random = options.random ?? Math.random
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  let since: number | null = options.since ?? null
  let active = options.startActive ?? true
  let stopped = false
  let started = false
  let status: TripChangesStatus = "connecting"
  let ticketUrl: string | null = null
  let ticketMintedAt = 0
  let backoffMs = BASE_BACKOFF_MS
  let wake: (() => void) | null = null
  const inFlight = new AbortController()

  function setStatus(next: TripChangesStatus) {
    if (next === status || stopped) return
    status = next
    options.onStatus?.(next)
  }

  function jittered(baseMs: number) {
    return baseMs * (1 + (random() - 0.5) * 2 * JITTER)
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

  function end() {
    // Not on the trip any more. Refresh once so the page shows what the server now says.
    setStatus("ended")
    options.onChange([])
    stopped = true
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
        end()
        return { delayMs: 0 }
      }
      ticketUrl = minted
      ticketMintedAt = Date.now()
      mintedThisPoll = true
    }

    const separator = ticketUrl.includes("?") ? "&" : "?"
    const url = since === null ? ticketUrl : `${ticketUrl}${separator}since=${since}`
    let response: Response
    try {
      response = await fetchImpl(url, { cache: "no-store", signal: inFlight.signal })
    } catch {
      return { delayMs: failureDelay() }
    }
    if (stopped) return { delayMs: 0 }

    if (response.status === 404) {
      // Either the ticket has expired or the viewer is no longer on the trip. A ticket
      // minted for this very poll cannot have expired, so that settles which.
      if (mintedThisPoll) {
        end()
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

    const parsed = TripChangesPageSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) return { delayMs: failureDelay() }
    if (stopped) return { delayMs: 0 }

    const page = parsed.data
    const baseline = since === null
    since = page.rev
    backoffMs = BASE_BACKOFF_MS
    setStatus("live")
    if (!baseline) {
      if (page.truncated) options.onChange([])
      else if (page.changes.length > 0) options.onChange(page.changes)
    }
    return { delayMs: jittered(intervalMs) }
  }

  async function run() {
    await sleep(random() * FIRST_POLL_MAX_DELAY_MS)
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
    // Pausing lets the request in flight finish, then waits; resuming polls at once, so a
    // tab coming back to the front catches up on everything it missed.
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
