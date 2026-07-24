"use client"

import { useEffect, useRef, useState } from "react"
import { LivePositionSchema, type LivePosition } from "@/lib/dtos/live-position"

export type LiveStreamStatus = "idle" | "connecting" | "live" | "ended" | "error"

type Options = {
  // Re-mints the stream URL (a fresh ticket) on reconnect. Without it, an error
  // just updates status — EventSource retries the same URL on its own, which is
  // fine for the unticketed public story stream but not a 5-minute-lived ticket.
  mintUrl?: () => Promise<string | null>
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 10000

export function useLivePositions(url: string | null, options: Options = {}) {
  const [positions, setPositions] = useState<LivePosition[]>([])
  const [status, setStatus] = useState<LiveStreamStatus>(url ? "connecting" : "idle")
  const mintUrlRef = useRef(options.mintUrl)
  useEffect(() => {
    mintUrlRef.current = options.mintUrl
  }, [options.mintUrl])

  // Reset for a new target during render, not inside the connecting effect below —
  // this is React's sanctioned "adjusting state when a prop changes" bail-out
  // pattern (the alternative, calling setState synchronously at the top of an
  // effect body, is a lint error: it causes an extra cascading render).
  const [trackedUrl, setTrackedUrl] = useState(url)
  if (url !== trackedUrl) {
    setTrackedUrl(url)
    setPositions([])
    setStatus(url ? "connecting" : "idle")
  }

  useEffect(() => {
    const byUserId = new Map<string, LivePosition>()

    if (!url) return

    let cancelled = false
    let backoffMs = BASE_BACKOFF_MS
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let source: EventSource | null = null

    function publish() {
      setPositions(Array.from(byUserId.values()))
    }

    function connect(streamUrl: string) {
      source = new EventSource(streamUrl)

      source.addEventListener("snapshot", (event) => {
        if (cancelled) return
        const entries = safeParseJsonArray((event as MessageEvent).data)
        byUserId.clear()
        for (const entry of entries) {
          const parsed = LivePositionSchema.safeParse(entry)
          if (parsed.success) byUserId.set(parsed.data.userId, parsed.data)
        }
        publish()
        backoffMs = BASE_BACKOFF_MS
        setStatus("live")
      })

      source.addEventListener("position", (event) => {
        if (cancelled) return
        const parsed = safeParseJson((event as MessageEvent).data)
        const result = LivePositionSchema.safeParse(parsed)
        if (!result.success) return
        byUserId.set(result.data.userId, result.data)
        publish()
        backoffMs = BASE_BACKOFF_MS
        setStatus("live")
      })

      source.addEventListener("end", () => {
        if (cancelled) return
        source?.close()
        setStatus("ended")
      })

      source.onerror = () => {
        if (cancelled) return
        setStatus("error")

        const mintUrl = mintUrlRef.current
        if (!mintUrl) return // let the browser's built-in retry handle it

        source?.close()
        const delay = backoffMs
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
        retryTimeout = setTimeout(async () => {
          if (cancelled) return
          const freshUrl = await mintUrl()
          if (cancelled || !freshUrl) return
          setStatus("connecting")
          connect(freshUrl)
        }, delay)
      }
    }

    connect(url)

    return () => {
      cancelled = true
      if (retryTimeout) clearTimeout(retryTimeout)
      source?.close()
    }
  }, [url])

  return { positions, status }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function safeParseJsonArray(raw: string): unknown[] {
  const parsed = safeParseJson(raw)
  return Array.isArray(parsed) ? parsed : []
}
