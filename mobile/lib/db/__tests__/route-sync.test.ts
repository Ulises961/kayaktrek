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

  // Found on a device: dragging a point twice in a row put it back where it started. A pull
  // checks for unsent edits when it starts, fetches, then replaces the whole local route; an edit
  // made while the fetch was in the air was overwritten by the older copy, and the unsent-edits
  // flag with it. The check has to hold at the moment of the write.
  describe("an edit made while the pull is in flight", () => {
    const route = (routeVersion: number, latitude: number) => ({
      routeVersion,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [
        { id: "point-1", dayId: "day-1", orderKey: "m", latitude, longitude: 1, name: null, notes: null, type: "position" },
      ],
    })

    async function seed(routeVersion = 3) {
      mockedApiGet.mockResolvedValueOnce(route(routeVersion, 10))
      const database = createTestDatabase()
      await pullRoute("trip-1", database)
      return database
    }

    async function editLocally(database: Database, latitude: number) {
      const [point] = await database.collections.get<Point>("points").query().fetch()
      const [meta] = await database.collections.get<RouteMeta>("route_meta").query().fetch()
      await database.write(async () => {
        await point.update((record) => {
          record.latitude = latitude
        })
        await meta.update((record) => {
          record.hasLocalChanges = true
        })
      })
    }

    it("is not overwritten by the older copy the pull fetched before it", async () => {
      const database = await seed()
      let respond: (value: ReturnType<typeof route>) => void = () => {}
      mockedApiGet.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))

      const pulling = pullRoute("trip-1", database)
      await new Promise((resolve) => setImmediate(resolve))
      await editLocally(database, 99)
      respond(route(3, 10))
      await pulling

      const [point] = await database.collections.get<Point>("points").query().fetch()
      const [meta] = await database.collections.get<RouteMeta>("route_meta").query().fetch()
      expect(point.latitude).toBe(99)
      expect(meta.hasLocalChanges).toBe(true)
    })

    it("does not count as a refresh when it was skipped", async () => {
      const database = await seed()
      let respond: (value: ReturnType<typeof route>) => void = () => {}
      mockedApiGet.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      const pulling = pullRoute("trip-1", database)
      await new Promise((resolve) => setImmediate(resolve))
      await editLocally(database, 99)
      const freshnessBefore = await database.collections.get("cache_freshness").query().fetch()
      const stampBefore = freshnessBefore.map((row) => `${row.id}:${(row as unknown as { cachedAt: number }).cachedAt}`)

      respond(route(3, 10))
      await pulling

      const freshnessAfter = await database.collections.get("cache_freshness").query().fetch()
      expect(freshnessAfter.map((row) => `${row.id}:${(row as unknown as { cachedAt: number }).cachedAt}`)).toEqual(stampBefore)
    })
  })

  it("never goes back to an older route version than the phone already has", async () => {
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 5,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [{ id: "new", dayId: "day-1", orderKey: "m", latitude: 5, longitude: 5, name: null, notes: null, type: "position" }],
    })
    const database = createTestDatabase()
    await pullRoute("trip-1", database)

    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 4,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [{ id: "old", dayId: "day-1", orderKey: "m", latitude: 4, longitude: 4, name: null, notes: null, type: "position" }],
    })
    await pullRoute("trip-1", database)

    const points = await database.collections.get<Point>("points").query().fetch()
    const [meta] = await database.collections.get<RouteMeta>("route_meta").query().fetch()
    expect(points.map((point) => point.id)).toEqual(["new"])
    expect(meta.routeVersion).toBe(5)
  })

  it("takes the server's route when the leader chose it, whatever version it is", async () => {
    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 5,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [{ id: "mine", dayId: "day-1", orderKey: "m", latitude: 5, longitude: 5, name: null, notes: null, type: "position" }],
    })
    const database = createTestDatabase()
    await pullRoute("trip-1", database)

    mockedApiGet.mockResolvedValueOnce({
      routeVersion: 4,
      days: [{ id: "day-1", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [{ id: "theirs", dayId: "day-1", orderKey: "m", latitude: 4, longitude: 4, name: null, notes: null, type: "position" }],
    })
    await pullRoute("trip-1", database, { discardLocalChanges: true })

    const points = await database.collections.get<Point>("points").query().fetch()
    expect(points.map((point) => point.id)).toEqual(["theirs"])
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
