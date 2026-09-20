import { TRIP_STATE } from "@shared/dtos/trip"

import { CACHE_KEY, readCachedAt } from "../cache-freshness"
import { pullRoute } from "../route-sync"
import { runSweep } from "../sweep"
import { syncTrip } from "../sync"
import { loadTripListCache } from "../trip-list-cache"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../trip-list-cache", () => ({ loadTripListCache: jest.fn() }))
jest.mock("../cache-freshness", () => ({
  ...jest.requireActual("../cache-freshness"),
  readCachedAt: jest.fn(),
}))
jest.mock("../sync", () => ({ syncTrip: jest.fn() }))
jest.mock("../route-sync", () => ({ pullRoute: jest.fn() }))

const mockLoadTripListCache = loadTripListCache as jest.Mock
const mockReadCachedAt = readCachedAt as jest.Mock
const mockSyncTrip = syncTrip as jest.Mock
const mockPullRoute = pullRoute as jest.Mock

function cachedTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-1",
    destination: "Costa Brava",
    state: TRIP_STATE.BUILDING,
    dateFrom: null,
    dateTo: null,
    travellerCount: 2,
    ...overrides,
  }
}

// The sweep awaits the trip-list cache and two freshness reads before it ever
// calls syncTrip, so asserting on it right after kicking one off races that
// prelude rather than testing anything.
async function waitForCalls(mock: jest.Mock, count: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && mock.mock.calls.length < count; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadTripListCache.mockResolvedValue([])
  mockReadCachedAt.mockResolvedValue(null)
  mockSyncTrip.mockResolvedValue(undefined)
  mockPullRoute.mockResolvedValue(undefined)
})

describe("runSweep", () => {
  // The bug WP7 closes: the route travels on its own channel and was pulled
  // only by the Itinerary screen, so a trip whose Itinerary tab was never
  // opened while connected had no route offline at all.
  it("pulls the route as well as the per-row aggregates, for a trip never visited", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "never-opened" })])

    await runSweep()

    expect(mockSyncTrip).toHaveBeenCalledWith("never-opened")
    expect(mockPullRoute).toHaveBeenCalledWith("never-opened")
  })

  it("sweeps every syncable trip in the cache, not just one", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "t1" }),
      cachedTrip({ id: "t2" }),
      cachedTrip({ id: "t3", state: TRIP_STATE.HAPPENING }),
    ])

    await runSweep()

    expect(mockSyncTrip.mock.calls.map(([id]) => id).sort()).toEqual(["t1", "t2", "t3"])
  })

  it("takes the trip list from the local cache, never the network", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip()])

    await runSweep()

    // The trip-list cache IS the sweep index (state/date_from/date_to are
    // already columns on it), so a sweep needs no new endpoint and no
    // round-trip before it can decide what to do.
    expect(mockLoadTripListCache).toHaveBeenCalled()
  })

  it("does not sweep past trips", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "old", state: TRIP_STATE.PAST, dateFrom: "2020-01-01" }),
    ])

    await runSweep()

    expect(mockSyncTrip).not.toHaveBeenCalled()
    expect(mockPullRoute).not.toHaveBeenCalled()
  })

  it("skips a trip whose caches are both inside its budget", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "fresh" })])
    mockReadCachedAt.mockResolvedValue(new Date().toISOString())

    await runSweep()

    expect(mockSyncTrip).not.toHaveBeenCalled()
  })

  // The two channels are refreshed independently, so "fresh" has to mean both.
  // A trip synced a minute ago whose route was never pulled is still missing
  // the single most important thing to have at sea.
  it("treats a trip as due when only one of its two channels is fresh", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "half-fresh" })])
    mockReadCachedAt.mockImplementation(async (key: string) =>
      key === CACHE_KEY.tripSync("half-fresh") ? new Date().toISOString() : null,
    )

    await runSweep()

    expect(mockSyncTrip).toHaveBeenCalledWith("half-fresh")
    expect(mockPullRoute).toHaveBeenCalledWith("half-fresh")
  })

  it("keeps sweeping the remaining trips after one fails", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "broken", state: TRIP_STATE.HAPPENING }),
      cachedTrip({ id: "fine" }),
    ])
    mockSyncTrip.mockImplementation(async (id: string) => {
      if (id === "broken") throw new Error("Could not reach the server.")
    })

    await runSweep()

    // Isolating per trip is the whole point: one trip failing is exactly how a
    // trip ends up with nothing cached, which is the failure being fixed.
    expect(mockSyncTrip).toHaveBeenCalledWith("fine")
    expect(mockPullRoute).toHaveBeenCalledWith("fine")
  })

  it("still pulls the route when the aggregate sync for that trip fails", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockSyncTrip.mockRejectedValue(new Error("boom"))

    await runSweep()

    expect(mockPullRoute).toHaveBeenCalledWith("t1")
  })

  it("resolves rather than rejecting when everything fails, as it does offline", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockSyncTrip.mockRejectedValue(new Error("Could not reach the server."))
    mockPullRoute.mockRejectedValue(new Error("Could not reach the server."))

    // Failing offline is this function's expected case, not an exceptional
    // one — it runs unattended with no UI waiting on it, so a rejection would
    // surface as an unhandled promise rejection and red-screen the app.
    await expect(runSweep()).resolves.toBeUndefined()
  })

  it("resolves when the trip-list cache itself cannot be read", async () => {
    mockLoadTripListCache.mockRejectedValue(new Error("no such table"))

    await expect(runSweep()).resolves.toBeUndefined()
  })

  it("runs a second sweep normally once the first has finished", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])

    await runSweep()
    await runSweep()

    expect(mockSyncTrip).toHaveBeenCalledTimes(2)
  })

  it("never runs two sweeps at once", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    let release: () => void = () => undefined
    mockSyncTrip.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const first = runSweep()
    await waitForCalls(mockSyncTrip, 1)
    const second = runSweep()
    await second

    // The second call returns immediately rather than queueing a duplicate:
    // foreground, reconnect and pull-to-refresh can all fire within a moment
    // of each other, and every trigger starting its own sweep would multiply
    // the request count by the number of triggers.
    expect(mockSyncTrip).toHaveBeenCalledTimes(1)
    release()
    await first
  })

  it("does not fire more requests at once than its concurrency bound", async () => {
    mockLoadTripListCache.mockResolvedValue(
      Array.from({ length: 6 }, (_unused, index) => cachedTrip({ id: `t${index}` })),
    )
    let inFlight = 0
    let peak = 0
    mockSyncTrip.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })

    await runSweep()

    // N cold cursors swept at once is slow and hammers a marginal link; the
    // sweep is fire-and-forget and must never block a render.
    expect(peak).toBeLessThanOrEqual(2)
    expect(mockSyncTrip).toHaveBeenCalledTimes(6)
  })
})
