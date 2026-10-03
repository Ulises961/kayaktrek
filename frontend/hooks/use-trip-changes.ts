"use client"

import { useEffect, useRef, useState } from "react"
import {
  TripChangeHelloSchema,
  TripChangeMessageSchema,
  type TripChange,
} from "@/lib/dtos/trip-change"

export type TripChangesStatus = "connecting" | "live" | "ended" | "error"

type Options = {
  // Mints a fresh ticketed stream URL. Called for the first connection and again on every
  // reconnect — a ticket lives 5 minutes, so the same URL cannot be retried verbatim.
  mintUrl: () => Promise<string | null>
  // Fired when something the viewer may be showing has changed: a `change` newer than the
  // last revision seen, or a reconnect whose revision differs from the last one seen.
  // `changes` is empty for the reconnect case, where the delta is unknown.
  onChange: (changes: TripChange[]) => void
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 10000

export function useTripChanges(tripId: string | null, options: Options) {
  const [status, setStatus] = useState<TripChangesStatus>("connecting")
  const mintUrlRef = useRef(options.mintUrl)
  const onChangeRef = useRef(options.onChange)
  useEffect(() => {
    mintUrlRef.current = options.mintUrl
    onChangeRef.current = options.onChange
  }, [options.mintUrl, options.onChange])

  useEffect(() => {
    if (!tripId) return

    let cancelled = false
    let backoffMs = BASE_BACKOFF_MS
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let source: EventSource | null = null
    let lastRevision: number | null = null

    function connect(streamUrl: string) {
      source = new EventSource(streamUrl)

      source.addEventListener("hello", (event) => {
        if (cancelled) return
        const hello = TripChangeHelloSchema.safeParse(parseJson((event as MessageEvent).data))
        if (!hello.success) return
        // First hello of this page load: the page is already rendered from fresh data.
        // Any later hello that disagrees means changes were missed while disconnected
        // (or Redis was flushed and the counter went backwards): refetch everything.
        if (lastRevision !== null && hello.data.rev !== lastRevision) onChangeRef.current([])
        lastRevision = hello.data.rev
        backoffMs = BASE_BACKOFF_MS
        setStatus("live")
      })

      source.addEventListener("change", (event) => {
        if (cancelled) return
        const message = TripChangeMessageSchema.safeParse(parseJson((event as MessageEvent).data))
        if (!message.success) return
        if (lastRevision !== null && message.data.rev <= lastRevision) return
        lastRevision = message.data.rev
        onChangeRef.current(message.data.changes)
      })

      source.addEventListener("end", () => {
        if (cancelled) return
        source?.close()
        setStatus("ended")
      })

      source.onerror = () => {
        if (cancelled) return
        setStatus("error")
        source?.close()
        scheduleReconnect()
      }
    }

    // Also the retry path for a mint that itself fails (rejects, or resolves null), so one
    // bad ticket refresh cannot leave the stream stuck with nothing scheduled to recover it.
    function scheduleReconnect() {
      const delay = backoffMs
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      retryTimeout = setTimeout(() => void openStream(), delay)
    }

    async function openStream() {
      let streamUrl: string | null = null
      try {
        streamUrl = await mintUrlRef.current()
      } catch {
        streamUrl = null
      }
      if (cancelled) return
      if (!streamUrl) {
        setStatus("error")
        scheduleReconnect()
        return
      }
      connect(streamUrl)
    }

    void openStream()

    return () => {
      cancelled = true
      if (retryTimeout) clearTimeout(retryTimeout)
      source?.close()
    }
  }, [tripId])

  return { status }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
