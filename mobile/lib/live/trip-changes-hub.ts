import type { TripChange } from "@shared/dtos/trip-change"
import type { TripChangesPollerOptions } from "@shared/live/trip-changes-poller"

export type TripChangeListener = (changes: TripChange[]) => void

export type TripChangesPoller = {
  start: () => void
  setActive: (active: boolean) => void
  stop: () => void
}

export type TripChangesHubDeps = {
  // A ticketed poll URL for the trip. `null` means the server refused: not on the trip.
  mintUrl: (tripId: string) => Promise<string | null>
  // Brings the local cache up to date. Failing is expected (offline) and never blocks the
  // listeners: a screen that cannot reach the server falls back to its cache anyway.
  refreshCaches: (tripId: string) => Promise<void>
  // The shared poller (`@shared/live/trip-changes-poller`), which owns the protocol.
  createPoller: (options: TripChangesPollerOptions) => TripChangesPoller
}

type TripFeed = {
  listeners: Set<TripChangeListener>
  poller: TripChangesPoller | null
  // The poller found the viewer is no longer on the trip: polling again would only be refused.
  ended: boolean
  refreshing: boolean
  dirty: boolean
  pendingChanges: TripChange[]
  // Something changed that the pending list cannot describe. Listeners are then told with an
  // empty delta, which every listener treats as "reload everything".
  unknownDelta: boolean
}

// One shared poller per trip, however many screens are showing it. A screen subscribes; the
// first subscriber starts polling and the last one stops it.
//
// Changes are hints, never data (M36). A change refreshes the local caches through the
// existing sync paths and then tells the listeners to re-read — the same reads they do on
// focus — so a dropped or duplicated change cannot corrupt anything.
export function createTripChangesHub(deps: TripChangesHubDeps) {
  const feeds = new Map<string, TripFeed>()
  let streamingEnabled = true

  // `null` when what changed is not known — see `TripFeed.unknownDelta`.
  async function announce(tripId: string, feed: TripFeed, changes: TripChange[] | null) {
    if (changes === null) feed.unknownDelta = true
    else feed.pendingChanges.push(...changes)
    feed.dirty = true
    if (feed.refreshing) return
    feed.refreshing = true
    try {
      while (feed.dirty) {
        feed.dirty = false
        const batch = feed.unknownDelta ? [] : feed.pendingChanges
        feed.pendingChanges = []
        feed.unknownDelta = false
        await deps.refreshCaches(tripId).catch(() => undefined)
        for (const listener of [...feed.listeners]) listener(batch)
      }
    } finally {
      feed.refreshing = false
    }
  }

  function ensureRunning(tripId: string, feed: TripFeed) {
    if (feed.poller || feed.ended || feed.listeners.size === 0) return
    feed.poller = deps.createPoller({
      mintUrl: () => deps.mintUrl(tripId),
      onChange: (changes) => void announce(tripId, feed, changes.length === 0 ? null : changes),
      onStatus: (status) => {
        if (status === "ended") feed.ended = true
      },
      // A poller for a screen that opens while the app is backgrounded waits for the gate.
      startActive: streamingEnabled,
    })
    feed.poller.start()
  }

  return {
    subscribe(tripId: string, listener: TripChangeListener): () => void {
      let feed = feeds.get(tripId)
      if (!feed) {
        feed = {
          listeners: new Set(),
          poller: null,
          ended: false,
          refreshing: false,
          dirty: false,
          pendingChanges: [],
          unknownDelta: false,
        }
        feeds.set(tripId, feed)
      }
      feed.listeners.add(listener)
      ensureRunning(tripId, feed)
      return () => {
        const current = feeds.get(tripId)
        if (!current) return
        current.listeners.delete(listener)
        if (current.listeners.size === 0) {
          current.poller?.stop()
          feeds.delete(tripId)
        }
      }
    },
    // Foreground and reachable. Off while backgrounded or offline: polling a phone in a
    // drybag only spends battery, and the sweep (sync-trigger.ts) catches up on the next
    // foreground or reconnect. Turning it back on polls at once.
    setStreaming(enabled: boolean) {
      streamingEnabled = enabled
      for (const feed of feeds.values()) feed.poller?.setActive(enabled)
    },
  }
}
