import {
  TripChangeHelloSchema,
  TripChangeMessageSchema,
  type TripChange,
} from "@shared/dtos/trip-change"

import type { SseEvent } from "./sse-parser"

export type TripChangeListener = (changes: TripChange[]) => void

export type TripChangesHubDeps = {
  // A ticketed stream URL. Re-minted on every connection: a ticket lives 5 minutes.
  mintUrl: (tripId: string) => Promise<string>
  readStream: (
    url: string,
    signal: AbortSignal,
    onEvent: (event: SseEvent) => void,
  ) => Promise<void>
  // Brings the local cache up to date. Failing is expected (offline) and never blocks the
  // listeners: a screen that cannot reach the server falls back to its cache anyway.
  refreshCaches: (tripId: string) => Promise<void>
  // Resolves early when the signal aborts.
  wait: (ms: number, signal: AbortSignal) => Promise<void>
}

type TripStream = {
  listeners: Set<TripChangeListener>
  controller: AbortController | null
  ended: boolean
  lastRevision: number | null
  refreshing: boolean
  dirty: boolean
  pendingChanges: TripChange[]
}

const BASE_BACKOFF_MS = 1000
// Longer than the web client's: a phone that cannot reach the stream is usually out of
// signal, and retrying every 10 seconds there only spends battery.
const MAX_BACKOFF_MS = 30000

// One shared connection per trip, however many screens are showing it. A screen subscribes;
// the first subscriber opens the stream and the last one closes it.
//
// Events are hints, never data (M36). A change refreshes the local caches through the
// existing sync paths and then tells the listeners to re-read — the same reads they do on
// focus — so a dropped or duplicated event cannot corrupt anything.
export function createTripChangesHub(deps: TripChangesHubDeps) {
  const streams = new Map<string, TripStream>()
  let streamingEnabled = true

  async function announce(tripId: string, stream: TripStream, changes: TripChange[]) {
    stream.pendingChanges.push(...changes)
    stream.dirty = true
    if (stream.refreshing) return

    stream.refreshing = true
    try {
      while (stream.dirty) {
        stream.dirty = false
        const batch = stream.pendingChanges
        stream.pendingChanges = []
        await deps.refreshCaches(tripId).catch(() => undefined)
        for (const listener of [...stream.listeners]) listener(batch)
      }
    } finally {
      stream.refreshing = false
    }
  }

  function parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async function run(tripId: string, stream: TripStream, controller: AbortController) {
    let backoffMs = BASE_BACKOFF_MS

    function handle(event: SseEvent) {
      if (event.event === "hello") {
        const hello = TripChangeHelloSchema.safeParse(parseJson(event.data))
        if (!hello.success) return
        // First hello since subscribing: the screens just loaded fresh. Any later hello that
        // disagrees means changes were missed while disconnected, or the counter went
        // backwards after a Redis flush — refresh either way.
        const missed = stream.lastRevision !== null && hello.data.rev !== stream.lastRevision
        stream.lastRevision = hello.data.rev
        backoffMs = BASE_BACKOFF_MS
        if (missed) void announce(tripId, stream, [])
      } else if (event.event === "change") {
        const message = TripChangeMessageSchema.safeParse(parseJson(event.data))
        if (!message.success) return
        if (stream.lastRevision !== null && message.data.rev <= stream.lastRevision) return
        stream.lastRevision = message.data.rev
        void announce(tripId, stream, message.data.changes)
      } else if (event.event === "end") {
        // Membership lost or trip gone: reconnecting would only be refused.
        stream.ended = true
        controller.abort()
      }
    }

    while (!controller.signal.aborted) {
      try {
        const url = await deps.mintUrl(tripId)
        if (controller.signal.aborted) return
        await deps.readStream(url, controller.signal, handle)
      } catch {
        // Fall through to the backoff: offline, a refused ticket and a dropped
        // connection are all the same to the caller — wait, re-mint, retry.
      }
      if (controller.signal.aborted) return
      await deps.wait(backoffMs, controller.signal)
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    }
  }

  function ensureRunning(tripId: string, stream: TripStream) {
    if (!streamingEnabled || stream.controller || stream.ended || stream.listeners.size === 0) {
      return
    }
    const controller = new AbortController()
    stream.controller = controller
    void run(tripId, stream, controller)
  }

  function stop(stream: TripStream) {
    stream.controller?.abort()
    stream.controller = null
  }

  return {
    subscribe(tripId: string, listener: TripChangeListener): () => void {
      let stream = streams.get(tripId)
      if (!stream) {
        stream = {
          listeners: new Set(),
          controller: null,
          ended: false,
          lastRevision: null,
          refreshing: false,
          dirty: false,
          pendingChanges: [],
        }
        streams.set(tripId, stream)
      }
      stream.listeners.add(listener)
      ensureRunning(tripId, stream)

      return () => {
        const current = streams.get(tripId)
        if (!current) return
        current.listeners.delete(listener)
        if (current.listeners.size === 0) {
          stop(current)
          streams.delete(tripId)
        }
      }
    },

    // Foreground and reachable. Off while backgrounded or offline: a stream held open on a
    // phone in a drybag only spends battery, and the sweep (sync-trigger.ts) catches up on
    // the next foreground or reconnect.
    setStreaming(enabled: boolean) {
      streamingEnabled = enabled
      for (const [tripId, stream] of streams) {
        if (enabled) ensureRunning(tripId, stream)
        else stop(stream)
      }
    },
  }
}
