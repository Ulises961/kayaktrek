import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useTripChanges } from "../use-trip-changes"
import { TRIP_CHANGE_OPERATION } from "@/lib/dtos/trip-change"

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
    const event = { data: typeof data === "string" ? data : JSON.stringify(data) }
    for (const listener of this.listeners[type] ?? []) listener(event)
  }

  triggerError() {
    this.onerror?.()
  }

  close() {
    this.closed = true
  }
}

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

function change(overrides: Partial<{ t: string; id: string; op: string }> = {}) {
  return { t: "point", id: "p1", op: TRIP_CHANGE_OPERATION.UPDATE, ...overrides }
}

type MintUrl = Mock<() => Promise<string | null>>

function setup(
  mintUrl: MintUrl = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue("http://sse/changes?ticket=a"),
) {
  const onChange = vi.fn()
  const hook = renderHook(() => useTripChanges(TRIP_ID, { mintUrl, onChange }))
  return { ...hook, mintUrl, onChange }
}

async function connected(mintUrl?: MintUrl) {
  const rendered = setup(mintUrl)
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
  return { ...rendered, source: FakeEventSource.instances[0] }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("useTripChanges", () => {
  it("opens nothing without a trip id", () => {
    const mintUrl = vi.fn()
    renderHook(() => useTripChanges(null, { mintUrl, onChange: vi.fn() }))
    expect(mintUrl).not.toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it("mints a ticketed url and connects to it", async () => {
    const { source, mintUrl } = await connected()
    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(source.url).toBe("http://sse/changes?ticket=a")
  })

  it("goes live on hello without refreshing — the page was just rendered fresh", async () => {
    const { source, result, onChange } = await connected()
    act(() => source.emit("hello", { rev: 7 }))
    expect(result.current.status).toBe("live")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("reports a change newer than the last revision seen", async () => {
    const { source, onChange } = await connected()
    act(() => source.emit("hello", { rev: 7 }))
    act(() => source.emit("change", { rev: 8, changes: [change()] }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([change()])
  })

  it("ignores a change at or below the last revision seen", async () => {
    const { source, onChange } = await connected()
    act(() => source.emit("hello", { rev: 7 }))
    act(() => source.emit("change", { rev: 7, changes: [change()] }))
    act(() => source.emit("change", { rev: 3, changes: [change()] }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("does not report the same revision twice", async () => {
    const { source, onChange } = await connected()
    act(() => source.emit("hello", { rev: 7 }))
    act(() => source.emit("change", { rev: 8, changes: [change()] }))
    act(() => source.emit("change", { rev: 8, changes: [change()] }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("accepts a change before any hello, then dedupes by it", async () => {
    const { source, onChange } = await connected()
    act(() => source.emit("change", { rev: 1, changes: [change()] }))
    act(() => source.emit("change", { rev: 1, changes: [change()] }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("ignores malformed payloads rather than throwing", async () => {
    const { source, onChange } = await connected()
    act(() => source.emit("hello", "not json"))
    act(() => source.emit("change", { rev: "x", changes: [] }))
    act(() => source.emit("change", { rev: 9, changes: [{ t: "point", id: "p1", op: "explode" }] }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("closes and does not reconnect on end", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { source, result, mintUrl } = await connected()
    act(() => source.emit("end", {}))
    expect(source.closed).toBe(true)
    expect(result.current.status).toBe("ended")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(mintUrl).toHaveBeenCalledTimes(1)
  })

  it("re-mints and reconnects after an error, and refetches if the revision moved meanwhile", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const mintUrl = vi
      .fn()
      .mockResolvedValueOnce("http://sse/changes?ticket=a")
      .mockResolvedValueOnce("http://sse/changes?ticket=b")
    const { source, onChange, result } = await connected(mintUrl)
    act(() => source.emit("hello", { rev: 7 }))

    act(() => source.triggerError())
    expect(source.closed).toBe(true)
    expect(result.current.status).toBe("error")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[1].url).toBe("http://sse/changes?ticket=b")

    act(() => FakeEventSource.instances[1].emit("hello", { rev: 12 }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([])
    expect(result.current.status).toBe("live")
  })

  it("does not refetch on reconnect when nothing changed while disconnected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const mintUrl = vi.fn().mockResolvedValue("http://sse/changes?ticket=a")
    const { source, onChange } = await connected(mintUrl)
    act(() => source.emit("hello", { rev: 7 }))
    act(() => source.triggerError())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    act(() => FakeEventSource.instances[1].emit("hello", { rev: 7 }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("retries a failed mint with backoff instead of giving up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const mintUrl = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("http://sse/changes?ticket=a")
    const { result } = setup(mintUrl)
    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(FakeEventSource.instances).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it("closes the stream and stops retrying on unmount", async () => {
    const { source, unmount } = await connected()
    unmount()
    expect(source.closed).toBe(true)
  })
})
