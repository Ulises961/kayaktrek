import { TRIP_CHANGE_OPERATION } from "@shared/dtos/trip-change"

import type { SseEvent } from "../sse-parser"
import { createTripChangesHub, type TripChangesHubDeps } from "../trip-changes-hub"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const POINT_CHANGE = { t: "point", id: "p1", op: TRIP_CHANGE_OPERATION.UPDATE }

function hello(rev: number): SseEvent {
  return { event: "hello", data: JSON.stringify({ rev }) }
}

function change(rev: number): SseEvent {
  return { event: "change", data: JSON.stringify({ rev, changes: [POINT_CHANGE] }) }
}

// Lets a test drive a connection: it holds `readStream` open until the test finishes it,
// and exposes the `onEvent` the hub registered.
function harness(overrides: Partial<TripChangesHubDeps> = {}) {
  const connections: {
    url: string
    signal: AbortSignal
    emit: (event: SseEvent) => void
    close: () => void
    fail: (error: Error) => void
  }[] = []
  const waits: number[] = []
  const calls: string[] = []

  const deps: TripChangesHubDeps = {
    mintUrl: jest.fn(async () => `http://sse/changes?ticket=${connections.length + 1}`),
    readStream: jest.fn(
      (url, signal, onEvent) =>
        new Promise<void>((resolve, reject) => {
          connections.push({ url, signal, emit: onEvent, close: resolve, fail: reject })
        }),
    ),
    refreshCaches: jest.fn(async () => {
      calls.push("refresh")
    }),
    wait: jest.fn(async (ms: number) => {
      waits.push(ms)
    }),
    ...overrides,
  }
  return { deps, connections, waits, calls, hub: createTripChangesHub(deps) }
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe("createTripChangesHub", () => {
  it("opens nothing until something subscribes", async () => {
    const { deps } = harness()
    await flush()
    expect(deps.mintUrl).not.toHaveBeenCalled()
  })

  it("opens one ticketed connection for the first subscriber", async () => {
    const { hub, deps, connections } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    expect(deps.mintUrl).toHaveBeenCalledWith(TRIP_ID)
    expect(connections).toHaveLength(1)
    expect(connections[0].url).toBe("http://sse/changes?ticket=1")
  })

  it("shares one connection between screens on the same trip", async () => {
    const { hub, connections } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()
    expect(connections).toHaveLength(1)
  })

  it("closes the connection when the last subscriber leaves, not before", async () => {
    const { hub, connections } = harness()
    const first = hub.subscribe(TRIP_ID, jest.fn())
    const second = hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    first()
    expect(connections[0].signal.aborted).toBe(false)
    second()
    expect(connections[0].signal.aborted).toBe(true)
  })

  it("does not refresh on the first hello — the screens just loaded fresh", async () => {
    const { hub, connections, deps } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()

    connections[0].emit(hello(7))
    await flush()

    expect(deps.refreshCaches).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  it("refreshes the caches first, then tells every listener what changed", async () => {
    const { hub, connections, calls } = harness()
    const first = jest.fn(() => calls.push("first"))
    const second = jest.fn(() => calls.push("second"))
    hub.subscribe(TRIP_ID, first)
    hub.subscribe(TRIP_ID, second)
    await flush()

    connections[0].emit(hello(7))
    connections[0].emit(change(8))
    await flush()

    expect(calls).toEqual(["refresh", "first", "second"])
    expect(first).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("treats a skipped revision as 'something changed, I do not know what'", async () => {
    // Revision 8 never arrived (Redis blipped, or a message was dropped). Telling listeners
    // only about 9's tables would let a screen that filters by table trust a delta that is
    // missing a change; an empty delta makes every listener reload.
    const { hub, connections } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()

    connections[0].emit(hello(7))
    connections[0].emit(change(9))
    await flush()

    expect(listener).toHaveBeenCalledWith([])
  })

  it("keeps the delta when revisions arrive in order", async () => {
    const { hub, connections } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()

    connections[0].emit(hello(7))
    connections[0].emit(change(8))
    await flush()

    expect(listener).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("ignores a change at or below the last revision seen", async () => {
    const { hub, connections, deps } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    connections[0].emit(hello(7))
    connections[0].emit(change(7))
    connections[0].emit(change(3))
    await flush()

    expect(deps.refreshCaches).not.toHaveBeenCalled()
  })

  it("ignores malformed events instead of throwing", async () => {
    const { hub, connections, deps } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    connections[0].emit({ event: "hello", data: "not json" })
    connections[0].emit({ event: "change", data: JSON.stringify({ rev: "x", changes: [] }) })
    connections[0].emit({ event: "unknown", data: "{}" })
    await flush()

    expect(deps.refreshCaches).not.toHaveBeenCalled()
  })

  it("still tells listeners when the cache refresh fails (offline)", async () => {
    const { hub, connections } = harness({
      refreshCaches: jest.fn().mockRejectedValue(new Error("offline")),
    })
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()

    connections[0].emit(hello(1))
    connections[0].emit(change(2))
    await flush()

    expect(listener).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("folds changes that arrive during a refresh into one follow-up refresh", async () => {
    let releaseFirstRefresh: () => void = () => undefined
    const refreshCaches = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirstRefresh = resolve)))
      .mockResolvedValue(undefined)
    const { hub, connections } = harness({ refreshCaches })
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()

    connections[0].emit(hello(1))
    connections[0].emit(change(2))
    await flush()
    connections[0].emit(change(3))
    connections[0].emit(change(4))
    releaseFirstRefresh()
    await flush()

    expect(refreshCaches).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("reconnects with a fresh ticket after a failure, backing off and doubling", async () => {
    const { hub, connections, waits, deps } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    connections[0].fail(new Error("dropped"))
    await flush()
    connections[1].fail(new Error("dropped"))
    await flush()

    expect(waits).toEqual([1000, 2000])
    expect(deps.mintUrl).toHaveBeenCalledTimes(3)
    expect(connections[2].url).toBe("http://sse/changes?ticket=3")
  })

  it("backs off when the ticket mint itself fails", async () => {
    const mintUrl = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("http://sse/changes?ticket=ok")
    const { hub, connections, waits } = harness({ mintUrl })
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    expect(waits).toEqual([1000])
    expect(connections).toHaveLength(1)
  })

  it("resets the backoff once a connection is healthy again", async () => {
    const { hub, connections, waits } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    connections[0].fail(new Error("dropped"))
    await flush()
    connections[1].emit(hello(1))
    connections[1].fail(new Error("dropped"))
    await flush()

    expect(waits).toEqual([1000, 1000])
  })

  it("caps the backoff", async () => {
    const { hub, connections, waits } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    for (let attempt = 0; attempt < 8; attempt++) {
      connections[attempt].fail(new Error("dropped"))
      await flush()
    }

    expect(Math.max(...waits)).toBe(30000)
  })

  it("refreshes after a reconnect whose revision moved while disconnected", async () => {
    const { hub, connections, deps } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)
    await flush()
    connections[0].emit(hello(7))
    connections[0].fail(new Error("dropped"))
    await flush()

    connections[1].emit(hello(12))
    await flush()

    expect(deps.refreshCaches).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([])
  })

  it("does not refresh after a reconnect when nothing changed", async () => {
    const { hub, connections, deps } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()
    connections[0].emit(hello(7))
    connections[0].fail(new Error("dropped"))
    await flush()

    connections[1].emit(hello(7))
    await flush()

    expect(deps.refreshCaches).not.toHaveBeenCalled()
  })

  it("stops for good on end, since reconnecting would only be refused", async () => {
    const { hub, connections, deps } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    connections[0].emit({ event: "end", data: "{}" })
    connections[0].close()
    await flush()

    expect(deps.mintUrl).toHaveBeenCalledTimes(1)
    expect(connections).toHaveLength(1)
  })

  it("closes while streaming is off and reopens when it comes back", async () => {
    const { hub, connections } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()

    hub.setStreaming(false)
    expect(connections[0].signal.aborted).toBe(true)

    hub.setStreaming(true)
    await flush()
    expect(connections).toHaveLength(2)
    expect(connections[1].signal.aborted).toBe(false)
  })

  it("does not open a connection for a new subscriber while streaming is off", async () => {
    const { hub, deps } = harness()
    hub.setStreaming(false)
    hub.subscribe(TRIP_ID, jest.fn())
    await flush()
    expect(deps.mintUrl).not.toHaveBeenCalled()
  })

  it("keeps trips independent", async () => {
    const OTHER_TRIP_ID = "01952f1a-0000-7000-8000-000000000002"
    const { hub, connections } = harness()
    const first = jest.fn()
    const other = jest.fn()
    hub.subscribe(TRIP_ID, first)
    hub.subscribe(OTHER_TRIP_ID, other)
    await flush()
    expect(connections).toHaveLength(2)

    connections[0].emit(hello(1))
    connections[0].emit(change(2))
    await flush()

    expect(first).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })
})
