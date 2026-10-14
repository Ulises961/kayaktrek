import { TRIP_CHANGE_OPERATION, type TripChange } from "@shared/dtos/trip-change"
import type { TripChangesPollerOptions } from "@shared/live/trip-changes-poller"

import { createTripChangesHub, type TripChangesHubDeps } from "../trip-changes-hub"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const OTHER_TRIP_ID = "01952f1a-0000-7000-8000-000000000002"

const POINT_CHANGE: TripChange = { t: "point", id: "p1", op: TRIP_CHANGE_OPERATION.UPDATE }

type FakePoller = {
  options: TripChangesPollerOptions
  started: boolean
  stopped: boolean
  active: boolean
}

// The shared poller's protocol has its own tests; here it is a handle the test can fire
// callbacks through and inspect.
function harness(overrides: Partial<TripChangesHubDeps> = {}) {
  const pollers: FakePoller[] = []
  const calls: string[] = []

  const deps: TripChangesHubDeps = {
    mintUrl: jest.fn(async () => "http://sse/changes?ticket=1"),
    refreshCaches: jest.fn(async () => {
      calls.push("refresh")
    }),
    createPoller: jest.fn((options: TripChangesPollerOptions) => {
      const poller: FakePoller = {
        options,
        started: false,
        stopped: false,
        active: options.startActive ?? true,
      }
      pollers.push(poller)
      return {
        start: () => {
          poller.started = true
        },
        setActive: (active: boolean) => {
          poller.active = active
        },
        stop: () => {
          poller.stopped = true
        },
      }
    }),
    ...overrides,
  }
  return { deps, pollers, calls, hub: createTripChangesHub(deps) }
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe("createTripChangesHub", () => {
  it("polls nothing until something subscribes", () => {
    const { deps } = harness()
    expect(deps.createPoller).not.toHaveBeenCalled()
  })

  it("starts one poller for the first subscriber, minting its url for that trip", async () => {
    const { hub, deps, pollers } = harness()
    hub.subscribe(TRIP_ID, jest.fn())

    expect(pollers).toHaveLength(1)
    expect(pollers[0].started).toBe(true)
    await pollers[0].options.mintUrl()
    expect(deps.mintUrl).toHaveBeenCalledWith(TRIP_ID)
  })

  it("shares one poller between screens on the same trip", () => {
    const { hub, pollers } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    hub.subscribe(TRIP_ID, jest.fn())
    expect(pollers).toHaveLength(1)
  })

  it("stops the poller when the last subscriber leaves, not before", () => {
    const { hub, pollers } = harness()
    const first = hub.subscribe(TRIP_ID, jest.fn())
    const second = hub.subscribe(TRIP_ID, jest.fn())

    first()
    expect(pollers[0].stopped).toBe(false)
    second()
    expect(pollers[0].stopped).toBe(true)
  })

  it("starts a new poller when a screen comes back after the last one left", () => {
    const { hub, pollers } = harness()
    hub.subscribe(TRIP_ID, jest.fn())()

    hub.subscribe(TRIP_ID, jest.fn())

    expect(pollers).toHaveLength(2)
    expect(pollers[1].stopped).toBe(false)
  })

  it("refreshes the caches first, then tells every listener what changed", async () => {
    const { hub, pollers, calls } = harness()
    const first = jest.fn(() => calls.push("first"))
    const second = jest.fn(() => calls.push("second"))
    hub.subscribe(TRIP_ID, first)
    hub.subscribe(TRIP_ID, second)

    pollers[0].options.onChange([POINT_CHANGE])
    await flush()

    expect(calls).toEqual(["refresh", "first", "second"])
    expect(first).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("passes on 'something changed, I do not know what' as an empty delta", async () => {
    // A screen that filters by table must reload on this, not trust a delta that may be
    // missing the change it cares about.
    const { hub, pollers } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)

    pollers[0].options.onChange([])
    await flush()

    expect(listener).toHaveBeenCalledWith([])
  })

  it("still tells listeners when the cache refresh fails (offline)", async () => {
    const { hub, pollers } = harness({
      refreshCaches: jest.fn().mockRejectedValue(new Error("offline")),
    })
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)

    pollers[0].options.onChange([POINT_CHANGE])
    await flush()

    expect(listener).toHaveBeenCalledWith([POINT_CHANGE])
  })

  it("folds changes that arrive during a refresh into one follow-up refresh", async () => {
    let releaseFirstRefresh: () => void = () => undefined
    const refreshCaches = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirstRefresh = resolve)))
      .mockResolvedValue(undefined)
    const { hub, pollers } = harness({ refreshCaches })
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)

    pollers[0].options.onChange([POINT_CHANGE])
    await flush()
    pollers[0].options.onChange([POINT_CHANGE])
    pollers[0].options.onChange([POINT_CHANGE])
    releaseFirstRefresh()
    await flush()

    expect(refreshCaches).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith([POINT_CHANGE, POINT_CHANGE])
  })

  it("lets an unknown delta swallow the changes batched with it", async () => {
    let releaseFirstRefresh: () => void = () => undefined
    const refreshCaches = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirstRefresh = resolve)))
      .mockResolvedValue(undefined)
    const { hub, pollers } = harness({ refreshCaches })
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)

    pollers[0].options.onChange([POINT_CHANGE])
    await flush()
    pollers[0].options.onChange([POINT_CHANGE])
    pollers[0].options.onChange([])
    releaseFirstRefresh()
    await flush()

    expect(listener).toHaveBeenLastCalledWith([])
  })

  it("polls only while the app is in the foreground and reachable", () => {
    const { hub, pollers } = harness()
    hub.subscribe(TRIP_ID, jest.fn())
    expect(pollers[0].active).toBe(true)

    hub.setStreaming(false)
    expect(pollers[0].active).toBe(false)

    hub.setStreaming(true)
    expect(pollers[0].active).toBe(true)
  })

  it("starts a poller for a new subscriber paused when the app is in the background", () => {
    const { hub, pollers } = harness()
    hub.setStreaming(false)

    hub.subscribe(TRIP_ID, jest.fn())

    expect(pollers[0].options.startActive).toBe(false)
    expect(pollers[0].started).toBe(true)
  })

  it("does not start another poller for a trip whose poller found the viewer is no longer on it", async () => {
    const { hub, pollers } = harness()
    const listener = jest.fn()
    hub.subscribe(TRIP_ID, listener)

    pollers[0].options.onChange([])
    pollers[0].options.onStatus?.("ended")
    await flush()
    hub.subscribe(TRIP_ID, jest.fn())

    expect(listener).toHaveBeenCalledWith([])
    expect(pollers).toHaveLength(1)
  })

  it("keeps trips independent", async () => {
    const { hub, pollers } = harness()
    const first = jest.fn()
    const other = jest.fn()
    hub.subscribe(TRIP_ID, first)
    hub.subscribe(OTHER_TRIP_ID, other)
    expect(pollers).toHaveLength(2)

    pollers[0].options.onChange([POINT_CHANGE])
    await flush()

    expect(first).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })
})
