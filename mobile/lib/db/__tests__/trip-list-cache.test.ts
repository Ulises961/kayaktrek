import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses, TripSummary } from "../models"
import { appDatabaseSchema } from "../schema"
import { saveTripListCache, loadTripListCache } from "../trip-list-cache"

jest.mock("../database", () => ({ database: {} }))

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

describe("trip list cache", () => {
  it("saves a trip list and reads it back as card-ready data", async () => {
    const database = createTestDatabase()
    await saveTripListCache(
      [
        {
          id: "trip-1",
          destination: "Isle of Skye",
          state: "building",
          dateFrom: "2026-10-01",
          dateTo: "2026-10-05",
          travellers: [{ id: "m1" }, { id: "m2" }],
        },
      ] as never,
      database
    )

    const cached = await loadTripListCache(database)
    expect(cached).toEqual([
      {
        id: "trip-1",
        destination: "Isle of Skye",
        state: "building",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-05",
        travellerCount: 2,
      },
    ])
  })

  it("wholesale-replaces the cache on a second save", async () => {
    const database = createTestDatabase()
    await saveTripListCache(
      [{ id: "trip-1", destination: "Old trip", state: null, dateFrom: null, dateTo: null, travellers: [] }] as never,
      database
    )
    await saveTripListCache(
      [{ id: "trip-2", destination: "New trip", state: null, dateFrom: null, dateTo: null, travellers: [] }] as never,
      database
    )

    const cached = await loadTripListCache(database)
    expect(cached.map((trip) => trip.id)).toEqual(["trip-2"])
  })

  it("returns an empty list when nothing has ever been cached", async () => {
    const database = createTestDatabase()
    const cached = await loadTripListCache(database)
    expect(cached).toEqual([])
  })
})

describe("TripSummary model", () => {
  it("is registered under the trips table", async () => {
    const database = createTestDatabase()
    const trips = database.collections.get<TripSummary>("trips")
    const created = await database.write(() =>
      trips.create((record) => {
        record.destination = "Test"
        record.travellerCount = 1
      })
    )
    expect((await trips.find(created.id)).destination).toBe("Test")
  })
})
