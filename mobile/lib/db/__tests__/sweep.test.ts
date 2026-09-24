import { TRIP_STATE } from "@shared/dtos/trip"

import { getMyItems } from "../../inventory/actions"
import { getPackingItems } from "../../inventory/personal-packing-actions"
import { CACHE_KEY, readCachedAt } from "../cache-freshness"
import { saveGearCache } from "../gear-cache"
import { saveKitCache } from "../kit-cache"
import { saveRequirementsCache } from "../requirements-cache"
import { saveBlocksCache, saveConnectionsCache } from "../paddlers-cache"
import { saveLogisticsCache } from "../logistics-cache"
import { getShuttleVehicles, getTravelDocuments } from "../../logistics/actions"
import { listConnections } from "../../connections/actions"
import { listBlocks } from "../../blocks/actions"
import { getLogStats } from "../../logs/actions"
import { getMe } from "../../profile/actions"
import { saveLogStatsCache, saveMeCache } from "../profile-cache"
import { pullRoute } from "../route-sync"
import { loadOfflineTrip } from "../offline-itinerary"
import { pushQueuedMutations } from "../mutation-queue"
import { pushRouteChanges, tripsWithRouteChanges } from "../route-edit"
import { ensureTripTiles, pruneTripTiles } from "../../map/offline-tiles"
import { getTrip, getTrips } from "../../trips/actions"
import { runSweep } from "../sweep"
import { syncTrip } from "../sync"
import { loadTripListCache, saveTripListCache } from "../trip-list-cache"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../trip-list-cache", () => ({ loadTripListCache: jest.fn(), saveTripListCache: jest.fn() }))
jest.mock("../../inventory/actions", () => ({ getMyItems: jest.fn() }))
jest.mock("../../inventory/personal-packing-actions", () => ({ getPackingItems: jest.fn() }))
jest.mock("../gear-cache", () => ({ saveGearCache: jest.fn() }))
jest.mock("../kit-cache", () => ({ saveKitCache: jest.fn() }))
jest.mock("../requirements-cache", () => ({ saveRequirementsCache: jest.fn() }))
jest.mock("../paddlers-cache", () => ({ saveConnectionsCache: jest.fn(), saveBlocksCache: jest.fn() }))
jest.mock("../logistics-cache", () => ({ saveLogisticsCache: jest.fn() }))
jest.mock("../../logistics/actions", () => ({
  getTravelDocuments: jest.fn(),
  getShuttleVehicles: jest.fn(),
}))
jest.mock("../../connections/actions", () => ({ listConnections: jest.fn() }))
jest.mock("../../blocks/actions", () => ({ listBlocks: jest.fn() }))
jest.mock("../../profile/actions", () => ({ getMe: jest.fn() }))
jest.mock("../../logs/actions", () => ({ getLogStats: jest.fn() }))
jest.mock("../profile-cache", () => ({ saveMeCache: jest.fn(), saveLogStatsCache: jest.fn() }))
jest.mock("../../trips/actions", () => ({ getTrip: jest.fn(), getTrips: jest.fn() }))
jest.mock("../cache-freshness", () => ({
  ...jest.requireActual("../cache-freshness"),
  readCachedAt: jest.fn(),
}))
jest.mock("../sync", () => ({ syncTrip: jest.fn() }))
jest.mock("../route-sync", () => ({ pullRoute: jest.fn() }))
jest.mock("../offline-itinerary", () => ({ loadOfflineTrip: jest.fn() }))
jest.mock("../mutation-queue", () => ({ pushQueuedMutations: jest.fn() }))
jest.mock("../route-edit", () => ({ pushRouteChanges: jest.fn(), tripsWithRouteChanges: jest.fn() }))
jest.mock("../../map/offline-tiles", () => ({ ensureTripTiles: jest.fn(), pruneTripTiles: jest.fn() }))

const mockLoadTripListCache = loadTripListCache as jest.Mock
const mockReadCachedAt = readCachedAt as jest.Mock
const mockSyncTrip = syncTrip as jest.Mock
const mockPullRoute = pullRoute as jest.Mock
const mockGetMyItems = getMyItems as jest.Mock
const mockGetPackingItems = getPackingItems as jest.Mock
const mockSaveGearCache = saveGearCache as jest.Mock
const mockSaveKitCache = saveKitCache as jest.Mock
const mockGetTrip = getTrip as jest.Mock
const mockGetTrips = getTrips as jest.Mock
const mockSaveTripListCache = saveTripListCache as jest.Mock
const mockSaveRequirementsCache = saveRequirementsCache as jest.Mock
const mockListConnections = listConnections as jest.Mock
const mockListBlocks = listBlocks as jest.Mock
const mockSaveConnectionsCache = saveConnectionsCache as jest.Mock
const mockSaveBlocksCache = saveBlocksCache as jest.Mock
const mockSaveLogisticsCache = saveLogisticsCache as jest.Mock
const mockGetTravelDocuments = getTravelDocuments as jest.Mock
const mockGetShuttleVehicles = getShuttleVehicles as jest.Mock
const mockLoadOfflineTrip = loadOfflineTrip as jest.Mock
const mockPushQueuedMutations = pushQueuedMutations as jest.Mock
const mockPushRouteChanges = pushRouteChanges as jest.Mock
const mockTripsWithRouteChanges = tripsWithRouteChanges as jest.Mock
const mockEnsureTripTiles = ensureTripTiles as jest.Mock
const mockPruneTripTiles = pruneTripTiles as jest.Mock
const mockGetMe = getMe as jest.Mock
const mockGetLogStats = getLogStats as jest.Mock
const mockSaveMeCache = saveMeCache as jest.Mock
const mockSaveLogStatsCache = saveLogStatsCache as jest.Mock

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
  mockGetMyItems.mockResolvedValue([])
  mockGetPackingItems.mockResolvedValue([])
  mockSaveGearCache.mockResolvedValue(undefined)
  mockSaveKitCache.mockResolvedValue(undefined)
  mockGetTrip.mockResolvedValue({ inventory: { requirements: [] } })
  mockGetTrips.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
  mockSaveTripListCache.mockResolvedValue(undefined)
  mockSaveRequirementsCache.mockResolvedValue(undefined)
  mockListConnections.mockResolvedValue([])
  mockListBlocks.mockResolvedValue([])
  mockSaveConnectionsCache.mockResolvedValue(undefined)
  mockSaveBlocksCache.mockResolvedValue(undefined)
  mockSaveLogisticsCache.mockResolvedValue(undefined)
  mockGetTravelDocuments.mockResolvedValue([])
  mockGetShuttleVehicles.mockResolvedValue([])
  mockLoadOfflineTrip.mockResolvedValue({ destination: null, days: [] })
  mockPushQueuedMutations.mockResolvedValue({ applied: 0, rejected: 0, kept: 0 })
  mockTripsWithRouteChanges.mockResolvedValue([])
  mockPushRouteChanges.mockResolvedValue("pushed")
  mockEnsureTripTiles.mockResolvedValue(undefined)
  mockPruneTripTiles.mockResolvedValue(undefined)
  mockGetMe.mockResolvedValue({ username: "ana" })
  mockGetLogStats.mockResolvedValue({ logCount: 0 })
  mockSaveMeCache.mockResolvedValue(undefined)
  mockSaveLogStatsCache.mockResolvedValue(undefined)
})

// Found on a device: after clearing app data, the first sweep synced no trips
// at all. The sweep's index is the trip-list cache, and only the trip list
// screen filled it — so a sweep that ran before that screen had saved found an
// empty index, and the itinerary stayed empty until the next reconnect.
describe("runSweep — the trip index", () => {
  it("refreshes the trip list from the network before planning", async () => {
    const fresh = [{ id: "t-new", state: TRIP_STATE.BUILDING }]
    mockGetTrips.mockResolvedValue({ items: fresh, total: 1, page: 1, pages: 1 })
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t-new" })])

    await runSweep()

    expect(mockSaveTripListCache).toHaveBeenCalledWith(fresh)
    // Saved before it is read, so the plan sees what the network just said.
    expect(mockSaveTripListCache.mock.invocationCallOrder[0]).toBeLessThan(
      mockLoadTripListCache.mock.invocationCallOrder[0],
    )
    expect(mockSyncTrip).toHaveBeenCalledWith("t-new")
  })

  it("falls back to the cached trip list when the refresh fails", async () => {
    mockGetTrips.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t-cached" })])

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSaveTripListCache).not.toHaveBeenCalled()
    expect(mockSyncTrip).toHaveBeenCalledWith("t-cached")
  })
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

// Tier 3 — the paddler's own kit and gear library (docs/adr/mobile-offline.md's
// tier table). Both caches already existed and both read screens already fall
// back to them; what was missing was anything WARMING them. They only filled if
// you happened to open the Items screen's "My kit" tab, or the Gear screen,
// while online — the same per-screen laziness the trip sweep exists to remove.
describe("runSweep — tier 3, kit and gear", () => {
  it("warms the gear closet, which is not scoped to any trip", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockGetMyItems.mockResolvedValue([{ id: "item-1", name: "Spare paddle" }])

    await runSweep()

    // No trips at all and it still runs: the closet is the user's, not a
    // trip's, so it must not be gated on having a syncable trip.
    expect(mockGetMyItems).toHaveBeenCalled()
    expect(mockSaveGearCache).toHaveBeenCalledWith([{ id: "item-1", name: "Spare paddle" }])
  })

  it("fetches the closet once per sweep, not once per trip", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "t1" }),
      cachedTrip({ id: "t2" }),
      cachedTrip({ id: "t3" }),
    ])

    await runSweep()

    expect(mockGetMyItems).toHaveBeenCalledTimes(1)
  })

  it("warms the per-trip kit for each trip it sweeps", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" }), cachedTrip({ id: "t2" })])
    mockGetPackingItems.mockImplementation(async (tripId: string) => [
      { id: `entry-${tripId}`, checked: false },
    ])

    await runSweep()

    expect(mockGetPackingItems.mock.calls.map(([id]) => id).sort()).toEqual(["t1", "t2"])
    expect(mockSaveKitCache).toHaveBeenCalledWith("t1", [{ id: "entry-t1", checked: false }])
    expect(mockSaveKitCache).toHaveBeenCalledWith("t2", [{ id: "entry-t2", checked: false }])
  })

  // The kit rides the trip's own tier rather than a flat schedule, so a trip
  // leaving tomorrow gets its packing list warmed at tier 1 urgency — packing
  // happens before departure, which is exactly when the trip is most urgent.
  it("does not warm the kit for a trip the sweep skipped", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "past", state: TRIP_STATE.PAST, dateFrom: "2020-01-01" }),
    ])

    await runSweep()

    expect(mockGetPackingItems).not.toHaveBeenCalled()
    expect(mockSaveKitCache).not.toHaveBeenCalled()
  })

  it("keeps a failing closet fetch from costing the trips their sync", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetMyItems.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSyncTrip).toHaveBeenCalledWith("t1")
    expect(mockSaveGearCache).not.toHaveBeenCalled()
  })

  it("keeps a failing kit fetch from costing that trip its route", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetPackingItems.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockPullRoute).toHaveBeenCalledWith("t1")
    expect(mockSaveKitCache).not.toHaveBeenCalled()
  })

  // The trip's Group checklist. It only arrives inside the full trip detail —
  // there is no lighter endpoint — but the alternative is the same hole the
  // route had: a trip whose Items screen was never opened while connected has
  // no requirements offline at all.
  it("warms each swept trip's requirements from its trip detail", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" }), cachedTrip({ id: "t2" })])
    mockGetTrip.mockImplementation(async (tripId: string) => ({
      id: tripId,
      inventory: { requirements: [{ id: `req-${tripId}`, name: "VHF radio" }] },
    }))

    await runSweep()

    expect(mockGetTrip.mock.calls.map(([id]) => id).sort()).toEqual(["t1", "t2"])
    expect(mockSaveRequirementsCache).toHaveBeenCalledWith("t1", [
      { id: "req-t1", name: "VHF radio" },
    ])
    expect(mockSaveRequirementsCache).toHaveBeenCalledWith("t2", [
      { id: "req-t2", name: "VHF radio" },
    ])
  })

  // An empty checklist is a real answer and must replace a stale one, not be
  // mistaken for "nothing to save" — a requirement removed on web would
  // otherwise linger in the offline copy forever.
  it("caches an empty checklist for a trip with no inventory", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetTrip.mockResolvedValue({ id: "t1", inventory: null })

    await runSweep()

    expect(mockSaveRequirementsCache).toHaveBeenCalledWith("t1", [])
  })

  it("does not fetch requirements for a trip the sweep skipped", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "past", state: TRIP_STATE.PAST, dateFrom: "2020-01-01" }),
    ])

    await runSweep()

    expect(mockGetTrip).not.toHaveBeenCalled()
  })

  it("keeps a failing requirements fetch from costing that trip its route and kit", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockPullRoute).toHaveBeenCalledWith("t1")
    expect(mockSaveKitCache).toHaveBeenCalledWith("t1", [])
    expect(mockSaveRequirementsCache).not.toHaveBeenCalled()
  })

  // The same per-screen laziness as the gear closet had: Paddlers only filled
  // its caches when opened online, so a device that never opened it while
  // connected showed nothing there offline.
  it("warms the buddy list and the blocklist, which are not scoped to any trip", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockListConnections.mockResolvedValue([{ id: "conn-1" }])
    mockListBlocks.mockResolvedValue([{ id: "block-1" }])

    await runSweep()

    expect(mockSaveConnectionsCache).toHaveBeenCalledWith([{ id: "conn-1" }])
    expect(mockSaveBlocksCache).toHaveBeenCalledWith([{ id: "block-1" }])
  })

  it("keeps a failing buddy fetch from costing the blocklist or the closet", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockListConnections.mockRejectedValue(new Error("Could not reach the server."))
    mockListBlocks.mockResolvedValue([])

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSaveBlocksCache).toHaveBeenCalledWith([])
    expect(mockSaveGearCache).toHaveBeenCalled()
    expect(mockSaveConnectionsCache).not.toHaveBeenCalled()
  })

  it("skips the buddy list and blocklist while each is inside its budget", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockReadCachedAt.mockImplementation(async (key: string) =>
      key === CACHE_KEY.connections || key === CACHE_KEY.blocks ? new Date().toISOString() : null,
    )

    await runSweep()

    expect(mockListConnections).not.toHaveBeenCalled()
    expect(mockListBlocks).not.toHaveBeenCalled()
  })

  // Travel documents and shuttle vehicles ride their trip's own tier, like the
  // kit and requirements: "which van am I in, and where is the pickup" is asked
  // on the morning of departure, when that trip is at its most urgent.
  it("warms each swept trip's logistics", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetTravelDocuments.mockResolvedValue([{ id: "doc-1", name: "Permit" }])
    mockGetShuttleVehicles.mockResolvedValue([{ id: "van-1", passengers: [] }])

    await runSweep()

    expect(mockSaveLogisticsCache).toHaveBeenCalledWith("t1", {
      documents: [{ id: "doc-1", name: "Permit" }],
      vehicles: [{ id: "van-1", passengers: [] }],
    })
  })

  it("keeps a failing logistics fetch from costing that trip its route", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockGetShuttleVehicles.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockPullRoute).toHaveBeenCalledWith("t1")
    expect(mockSaveLogisticsCache).not.toHaveBeenCalled()
  })

  it("skips the closet while it is inside its own budget", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockReadCachedAt.mockImplementation(async (key: string) =>
      key === CACHE_KEY.gear ? new Date().toISOString() : null,
    )

    await runSweep()

    expect(mockGetMyItems).not.toHaveBeenCalled()
  })
})

// Tier 4: the paddler's own record and log stats, for Profile, Settings and
// the drawer header. Last in the sweep — tiny, slow-changing, never at sea.
// M9d: changes made offline go up before anything comes down, so a pull never
// overwrites a change the paddler made with the server's older copy.
describe("runSweep — sending queued changes", () => {
  it("sends the queue before refreshing the trip list", async () => {
    await runSweep()

    expect(mockPushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mockPushQueuedMutations.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetTrips.mock.invocationCallOrder[0],
    )
  })

  it("pushes a route the leader edited offline before pulling routes", async () => {
    mockTripsWithRouteChanges.mockResolvedValue(["t1"])
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])

    await runSweep()

    expect(mockPushRouteChanges).toHaveBeenCalledWith("t1")
    expect(mockPushRouteChanges.mock.invocationCallOrder[0]).toBeLessThan(
      mockPullRoute.mock.invocationCallOrder[0],
    )
  })

  it("still sends the queue when a route push fails", async () => {
    mockTripsWithRouteChanges.mockResolvedValue(["t1"])
    mockPushRouteChanges.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockPushQueuedMutations).toHaveBeenCalled()
  })

  it("still pulls when the queue can't be sent", async () => {
    mockPushQueuedMutations.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSyncTrip).toHaveBeenCalledWith("t1")
  })
})

// M9g free tier: each swept trip keeps the map tiles for its itinerary's opening
// view, so the map under the route still renders offline.
describe("runSweep — map tiles", () => {
  const DAY_ONE = {
    id: "day-1",
    dayNumber: 1,
    points: [
      { id: "p1", latitude: 41.8, longitude: 3.1, nextId: "p2" },
      { id: "p2", latitude: 42.0, longitude: 3.3, nextId: null },
    ],
  }

  it("downloads each swept trip's map once its route has been pulled", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockLoadOfflineTrip.mockResolvedValue({ destination: null, days: [DAY_ONE] })

    await runSweep()

    expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.1, 41.8, 3.3, 42.0])
    expect(mockPullRoute.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureTripTiles.mock.invocationCallOrder[0],
    )
  })

  // A circular itinerary ends where it started. Its box must still take in every
  // point on the loop, however the return to the start is stored.
  describe("circular itineraries", () => {
    // Out east along the coast, north, and back west to the put-in.
    const LOOP = [
      { id: "start", latitude: 41.8, longitude: 3.1 },
      { id: "east", latitude: 41.85, longitude: 3.4 },
      { id: "north", latitude: 42.1, longitude: 3.3 },
      { id: "west", latitude: 42.0, longitude: 3.0 },
    ]

    it("covers the whole loop when it ends on its own point at the put-in", async () => {
      mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
      const points = [...LOOP, { id: "finish", latitude: 41.8, longitude: 3.1 }].map(
        (point, index, all) => ({ ...point, nextId: all[index + 1]?.id ?? null }),
      )
      mockLoadOfflineTrip.mockResolvedValue({
        destination: null,
        days: [{ id: "day-1", dayNumber: 1, points }],
      })

      await runSweep()

      expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.0, 41.8, 3.4, 42.1])
    })

    it("covers the whole loop when its last point links back to the first", async () => {
      mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
      const points = LOOP.map((point, index, all) => ({
        ...point,
        nextId: all[(index + 1) % all.length].id,
      }))
      mockLoadOfflineTrip.mockResolvedValue({
        destination: null,
        days: [{ id: "day-1", dayNumber: 1, points }],
      })

      await runSweep()

      expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.0, 41.8, 3.4, 42.1])
    })

    it("covers a loop split across days that share their overnight stops", async () => {
      mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
      const [start, east, north, west] = LOOP
      mockLoadOfflineTrip.mockResolvedValue({
        destination: null,
        days: [
          {
            id: "day-1",
            dayNumber: 1,
            startPointId: "start",
            endPointId: "north",
            points: [
              { ...start, nextId: "east" },
              { ...east, nextId: "north" },
            ],
          },
          {
            id: "day-2",
            dayNumber: 2,
            startPointId: "north",
            endPointId: "finish",
            points: [
              { ...north, nextId: "west" },
              { ...west, nextId: "finish" },
              { id: "finish", latitude: 41.8, longitude: 3.1, nextId: null },
            ],
          },
        ],
      })

      await runSweep()

      expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.0, 41.8, 3.4, 42.1])
    })
  })

  // Day 0 is the staging area for unassigned points (numbered-days.ts). The map's
  // camera ignores it, so the download must too.
  it("leaves Day 0's points out of the map's box", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    const dayZero = {
      id: "day-0",
      dayNumber: 0,
      points: [{ id: "p0", latitude: 10, longitude: 10, nextId: null }],
    }
    mockLoadOfflineTrip.mockResolvedValue({ destination: null, days: [dayZero, DAY_ONE] })

    await runSweep()

    expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.1, 41.8, 3.3, 42.0])
  })

  // A trip inside its staleness budget is not re-synced, but it still needs its
  // map — otherwise an app update would leave every trip without one until its
  // budget ran out.
  it("covers trips that are inside their budget, from the route already on the device", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockReadCachedAt.mockResolvedValue(new Date().toISOString())
    mockLoadOfflineTrip.mockResolvedValue({ destination: null, days: [DAY_ONE] })

    await runSweep()

    expect(mockPullRoute).not.toHaveBeenCalled()
    expect(mockEnsureTripTiles).toHaveBeenCalledWith("t1", [3.1, 41.8, 3.3, 42.0])
  })

  it("keeps a failing map download from costing the trip anything else", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t1" })])
    mockLoadOfflineTrip.mockResolvedValue({ destination: null, days: [DAY_ONE] })
    mockEnsureTripTiles.mockRejectedValue(new Error("offline database locked"))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSaveKitCache).toHaveBeenCalled()
    expect(mockSaveLogisticsCache).toHaveBeenCalled()
  })

  // Past and archived trips are not synced, so their maps go too.
  it("drops the maps of trips the sweep no longer covers", async () => {
    mockLoadTripListCache.mockResolvedValue([
      cachedTrip({ id: "planned" }),
      cachedTrip({ id: "under-way", state: TRIP_STATE.HAPPENING }),
      cachedTrip({ id: "done", state: TRIP_STATE.PAST }),
    ])

    await runSweep()

    expect(mockPruneTripTiles).toHaveBeenCalledWith(new Set(["planned", "under-way"]))
  })
})

describe("runSweep — tier 4, profile", () => {
  it("warms the paddler's own record and log stats", async () => {
    await runSweep()

    expect(mockSaveMeCache).toHaveBeenCalledWith({ username: "ana" })
    expect(mockSaveLogStatsCache).toHaveBeenCalledWith({ logCount: 0 })
  })

  it("keeps a failing stats fetch from costing the record", async () => {
    mockGetLogStats.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSaveMeCache).toHaveBeenCalled()
    expect(mockSaveLogStatsCache).not.toHaveBeenCalled()
  })

  it("keeps a failing profile fetch from costing the buddy list", async () => {
    mockGetMe.mockRejectedValue(new Error("Could not reach the server."))

    await expect(runSweep()).resolves.toBeUndefined()

    expect(mockSaveConnectionsCache).toHaveBeenCalled()
  })

  it("skips the record and stats while each is inside its budget", async () => {
    mockReadCachedAt.mockImplementation(async (key: string) =>
      key === CACHE_KEY.me || key === CACHE_KEY.logStats ? new Date().toISOString() : null,
    )

    await runSweep()

    expect(mockGetMe).not.toHaveBeenCalled()
    expect(mockGetLogStats).not.toHaveBeenCalled()
  })
})

// A sweep that fails silently was right for the paddler and wrong for anyone
// diagnosing it: on-device testing found one trip missing its crew sync and
// another missing its route, with no way to tell why. Nothing surfaces to the
// UI — this only has to leave a trace a developer can read.
describe("runSweep — failure reporting", () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it("names the trip and the channel when one fails", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "trip-7" })])
    mockPullRoute.mockRejectedValue(new Error("No itinerary for trip"))

    await runSweep()

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("trip-7"),
      expect.objectContaining({ message: "No itinerary for trip" }),
    )
    expect(warn.mock.calls.some(([label]) => String(label).includes("route"))).toBe(true)
  })

  it("reports each failing channel separately rather than collapsing them", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "trip-7" })])
    mockSyncTrip.mockRejectedValue(new Error("sync boom"))
    mockPullRoute.mockRejectedValue(new Error("route boom"))

    await runSweep()

    const labels = warn.mock.calls.map(([label]) => String(label))
    expect(labels.some((label) => label.includes("sync"))).toBe(true)
    expect(labels.some((label) => label.includes("route"))).toBe(true)
  })

  it("reports a failing gear closet under its own name, not a trip's", async () => {
    mockLoadTripListCache.mockResolvedValue([])
    mockGetMyItems.mockRejectedValue(new Error("closet boom"))

    await runSweep()

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("gear closet"),
      expect.objectContaining({ message: "closet boom" }),
    )
  })

  it("stays quiet when everything succeeds", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "trip-7" })])

    await runSweep()

    expect(warn).not.toHaveBeenCalled()
  })
})

// Found on a real device, not by these tests: with two trips swept at once,
// one of them came back with no crew and no freshness, and the logged reason
// was "[Sync] Concurrent synchronization is not allowed. More than one
// synchronize() call was running at the same time, and the later one was
// aborted". `synchronize()` is global to the local database, not scoped to the
// trip whose endpoint it pulls, so the sweep's own concurrency bound was
// silently costing every batch one trip's aggregates.
//
// These tests exist because the earlier ones mocked `syncTrip` as an
// independent promise and so could never have caught it.
describe("runSweep — synchronize() is not concurrency-safe", () => {
  it("never overlaps two syncTrip calls, even while sweeping trips in parallel", async () => {
    mockLoadTripListCache.mockResolvedValue(
      Array.from({ length: 4 }, (_unused, index) => cachedTrip({ id: `t${index}` })),
    )
    let inFlight = 0
    let peak = 0
    mockSyncTrip.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setImmediate(resolve))
      inFlight -= 1
    })

    await runSweep()

    expect(peak).toBe(1)
    expect(mockSyncTrip).toHaveBeenCalledTimes(4)
  })

  it("keeps the route and kit channels concurrent, which have no such constraint", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t0" }), cachedTrip({ id: "t1" })])
    let peak = 0
    let inFlight = 0
    mockPullRoute.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setImmediate(resolve))
      inFlight -= 1
    })

    await runSweep()

    // Serialising everything would have been the easy fix and would have made
    // a cold multi-trip sweep needlessly slow on the marginal link it is most
    // likely to run on.
    expect(peak).toBe(2)
  })

  it("releases the sync lock when a trip's sync throws, so later trips still sync", async () => {
    mockLoadTripListCache.mockResolvedValue([cachedTrip({ id: "t0" }), cachedTrip({ id: "t1" })])
    mockSyncTrip.mockRejectedValueOnce(new Error("boom"))

    await runSweep()

    expect(mockSyncTrip).toHaveBeenCalledTimes(2)
  })
})
