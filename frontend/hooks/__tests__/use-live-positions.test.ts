import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useLivePositions } from "../use-live-positions"

type Listener = (event: { data: string }) => void

class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  listeners: Record<string, Listener[]> = {}
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) }
    for (const listener of this.listeners[type] ?? []) listener(event)
  }

  triggerError() {
    this.onerror?.()
  }

  close() {
    this.closed = true
  }
}

function position(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "u1",
    name: "Paddler One",
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: "2026-07-20T10:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("useLivePositions", () => {
  it("stays idle and opens nothing when url is null", () => {
    const { result } = renderHook(() => useLivePositions(null))
    expect(result.current.status).toBe("idle")
    expect(result.current.positions).toEqual([])
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it("connects immediately and goes live on the snapshot event", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    expect(result.current.status).toBe("connecting")

    const source = FakeEventSource.instances[0]
    act(() => source.emit("snapshot", [position()]))

    await waitFor(() => expect(result.current.status).toBe("live"))
    expect(result.current.positions).toEqual([position()])
  })

  it("a later position event for the same userId replaces the snapshot entry", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    const source = FakeEventSource.instances[0]

    act(() => source.emit("snapshot", [position({ lat: 1 })]))
    await waitFor(() => expect(result.current.positions).toHaveLength(1))

    act(() => source.emit("position", position({ lat: 2 })))
    await waitFor(() => expect(result.current.positions[0].lat).toBe(2))
    expect(result.current.positions).toHaveLength(1)
  })

  it("a position event for a new userId is added alongside existing ones", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    const source = FakeEventSource.instances[0]

    act(() => source.emit("snapshot", [position({ userId: "u1" })]))
    act(() => source.emit("position", position({ userId: "u2" })))

    await waitFor(() => expect(result.current.positions).toHaveLength(2))
  })

  it("drops an invalid entry silently instead of crashing", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    const source = FakeEventSource.instances[0]

    act(() => source.emit("snapshot", [position(), { garbage: true }]))

    await waitFor(() => expect(result.current.status).toBe("live"))
    expect(result.current.positions).toHaveLength(1)
  })

  it("closes the stream and moves to ended on the end event", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    const source = FakeEventSource.instances[0]

    act(() => source.emit("snapshot", []))
    act(() => source.emit("end", {}))

    await waitFor(() => expect(result.current.status).toBe("ended"))
    expect(source.closed).toBe(true)
  })

  it("without mintUrl, an error just reports status and leaves the browser to auto-reconnect", async () => {
    const { result } = renderHook(() => useLivePositions("http://sse/stream"))
    const source = FakeEventSource.instances[0]

    act(() => source.triggerError())

    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(source.closed).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it("with mintUrl, an error closes the stream and reconnects to a freshly minted url", async () => {
    vi.useFakeTimers()
    const mintUrl = vi.fn().mockResolvedValue("http://sse/stream?ticket=fresh")

    const { result } = renderHook(() =>
      useLivePositions("http://sse/stream?ticket=stale", { mintUrl }),
    )
    const firstSource = FakeEventSource.instances[0]

    act(() => firstSource.triggerError())
    expect(firstSource.closed).toBe(true)

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[1].url).toBe("http://sse/stream?ticket=fresh")

    const secondSource = FakeEventSource.instances[1]
    act(() => secondSource.emit("snapshot", []))
    expect(result.current.status).toBe("live")
  })

  it("retries again with backoff when mintUrl resolves to nothing", async () => {
    vi.useFakeTimers()
    const mintUrl = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("http://sse/fresh")

    const { result } = renderHook(() => useLivePositions("http://sse/stream", { mintUrl }))
    const firstSource = FakeEventSource.instances[0]

    act(() => firstSource.triggerError())
    expect(firstSource.closed).toBe(true)

    // First mint attempt resolves null — no new EventSource yet, but a second
    // attempt must still be scheduled instead of leaving the stream stuck.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(result.current.status).toBe("error")

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(mintUrl).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[1].url).toBe("http://sse/fresh")
  })

  it("retries again with backoff when mintUrl itself rejects, without crashing", async () => {
    vi.useFakeTimers()
    const mintUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ticket endpoint down"))
      .mockResolvedValueOnce("http://sse/fresh")

    const { result } = renderHook(() => useLivePositions("http://sse/stream", { mintUrl }))
    const firstSource = FakeEventSource.instances[0]

    act(() => firstSource.triggerError())

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(result.current.status).toBe("error")

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(mintUrl).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[1].url).toBe("http://sse/fresh")
  })

  it("stops retrying and closes the stream once unmounted mid-backoff", async () => {
    vi.useFakeTimers()
    const mintUrl = vi.fn().mockResolvedValue("http://sse/fresh")

    const { unmount } = renderHook(() => useLivePositions("http://sse/stream", { mintUrl }))
    const firstSource = FakeEventSource.instances[0]

    act(() => firstSource.triggerError())
    unmount()

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(mintUrl).not.toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})
