import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { apiGet } from "../../api/client"
import { modelClasses, Day, Point, RouteMeta } from "../models"
import { appDatabaseSchema } from "../schema"
import { pullRoute } from "../route-sync"

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

describe("pullRoute", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("stores the route's days, points, and route_version for the trip", async () => {
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 3,
      days: [{ id: "day-1", dayNumber: 0, date: "2026-09-14", startPointId: null, endPointId: null }],
      points: [
        {
          id: "point-1", dayId: "day-1", orderKey: "m", latitude: 44.1, longitude: 8.5,
          name: null, notes: null, type: "position",
        },
      ],
    })

    const database = createTestDatabase()
    await pullRoute("trip-1", database)

    expect(mockedApiGet).toHaveBeenCalledWith("/api/sync/trip/trip-1/route/pull")

    const days = database.collections.get<Day>("days")
    const day = await days.find("day-1")
    expect(day.tripId).toBe("trip-1")
    expect(day.dayNumber).toBe(0)

    const points = database.collections.get<Point>("points")
    const point = await points.find("point-1")
    expect(point.dayId).toBe("day-1")
    expect(point.orderKey).toBe("m")

    const routeMeta = database.collections.get<RouteMeta>("route_meta")
    const metaRows = await routeMeta.query().fetch()
    expect(metaRows).toHaveLength(1)
    expect(metaRows[0].routeVersion).toBe(3)
  })

  it("wholesale-replaces the trip's route on a second pull — a point missing from the new payload is gone", async () => {
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 1,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [
        { id: "point-1", dayId: "day-1", orderKey: "m", latitude: 1, longitude: 1, name: null, notes: null, type: "position" },
        { id: "point-2", dayId: "day-1", orderKey: "t", latitude: 2, longitude: 2, name: null, notes: null, type: "position" },
      ],
    })
    const database = createTestDatabase()
    await pullRoute("trip-1", database)

    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 2,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [
        { id: "point-2", dayId: "day-1", orderKey: "m", latitude: 2, longitude: 2, name: null, notes: null, type: "position" },
      ],
    })
    await pullRoute("trip-1", database)

    const points = database.collections.get<Point>("points")
    const remaining = await points.query().fetch()
    expect(remaining.map((p) => p.id)).toEqual(["point-2"])

    const routeMeta = database.collections.get<RouteMeta>("route_meta")
    const metaRows = await routeMeta.query().fetch()
    expect(metaRows).toHaveLength(1)
    expect(metaRows[0].routeVersion).toBe(2)
  })

  it("does not touch another trip's cached route", async () => {
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 1,
      days: [{ id: "trip-a-day", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [],
    })
    const database = createTestDatabase()
    await pullRoute("trip-a", database)

    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 1,
      days: [{ id: "trip-b-day", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [],
    })
    await pullRoute("trip-b", database)

    const days = database.collections.get<Day>("days")
    const allDays = await days.query().fetch()
    expect(allDays.map((d) => d.id).sort()).toEqual(["trip-a-day", "trip-b-day"])
  })
})
