import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { apiGet } from "../../api/client"
import { modelClasses } from "../models"
import { loadOfflineTrip } from "../offline-itinerary"
import { pullRoute } from "../route-sync"
import { appDatabaseSchema } from "../schema"
import { saveTripListCache } from "../trip-list-cache"

jest.mock("../../api/client", () => ({ apiGet: jest.fn() }))
jest.mock("../database", () => ({ database: {} }))

const mockedApiGet = apiGet as jest.MockedFunction<typeof apiGet>

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

describe("loadOfflineTrip", () => {
  afterEach(() => jest.clearAllMocks())

  it("reconstructs days with a synthesized nextId chain, in order_key order", async () => {
    const database = createTestDatabase()
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 1,
      days: [{ id: "day-1", dayNumber: 0, date: "2026-09-20", startPointId: null, endPointId: null }],
      points: [
        { id: "point-a", dayId: "day-1", orderKey: "b", latitude: 2, longitude: 2, name: null, notes: null, type: "position" },
        { id: "point-b", dayId: "day-1", orderKey: "a", latitude: 1, longitude: 1, name: null, notes: null, type: "stop" },
      ],
    })
    await pullRoute("trip-1", database)

    const { days } = await loadOfflineTrip("trip-1", database)

    expect(days).toHaveLength(1)
    expect(days[0].points?.map((p) => p.id)).toEqual(["point-b", "point-a"])
    expect(days[0].points?.[0].nextId).toBe("point-a")
    expect(days[0].points?.[1].nextId).toBeNull()
    expect(days[0].points?.[0].type).toBe("stop")
  })

  it("attaches cached weather and sea for the day, when present", async () => {
    const database = createTestDatabase()
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 1,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [],
    })
    await pullRoute("trip-1", database)

    const weatherCollection = database.collections.get("weather")
    const seaCollection = database.collections.get("sea")
    await database.write(async () => {
      await database.batch(
        weatherCollection.prepareCreateFromDirtyRaw({
          id: "day-1", day_id: "day-1", model: "open-meteo", fetched_at: 1_700_000_000_000,
        }),
        seaCollection.prepareCreateFromDirtyRaw({
          id: "day-1", day_id: "day-1", moon_phase: "full", recorded_at: 1_700_000_000_000,
        })
      )
    })

    const { days } = await loadOfflineTrip("trip-1", database)
    expect(days[0].weather?.model).toBe("open-meteo")
    expect(days[0].sea?.moonPhase).toBe("full")
  })

  it("falls back to the cached trip-list destination, and to null when nothing is cached", async () => {
    const database = createTestDatabase()
    mockedApiGet.mockResolvedValueOnce({ routeVersion: 1, days: [], points: [] })
    await pullRoute("trip-1", database)

    const withoutCache = await loadOfflineTrip("trip-1", database)
    expect(withoutCache.destination).toBeNull()

    await saveTripListCache(
      [{ id: "trip-1", destination: "Isle of Skye", state: "building", dateFrom: null, dateTo: null, travellers: [] }] as never,
      database
    )
    const withCache = await loadOfflineTrip("trip-1", database)
    expect(withCache.destination).toBe("Isle of Skye")
  })

  it("returns no days for a trip that was never synced", async () => {
    const database = createTestDatabase()
    const { days } = await loadOfflineTrip("never-synced-trip", database)
    expect(days).toEqual([])
  })
})
