import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { ApiError, apiGet, apiPost } from "../../api/client"
import { deletePoint, editPoint } from "../../itinerary/route-edits"
import { modelClasses } from "../models"
import {
  editRoute,
  loadEditableRoute,
  loadRouteSyncState,
  pushRouteChanges,
  resolveRouteConflict,
} from "../route-edit"
import { pullRoute } from "../route-sync"
import { appDatabaseSchema } from "../schema"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../../api/client", () => ({
  ...jest.requireActual("../../api/client"),
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

const SERVER_ROUTE = {
  routeVersion: 4,
  days: [{ id: "d1", dayNumber: 1, date: "2026-10-01", startPointId: "a", endPointId: "c" }],
  points: [
    { id: "a", dayId: "d1", orderKey: "00001000", latitude: 42, longitude: 3, name: "A", notes: null, type: "stop" },
    { id: "b", dayId: "d1", orderKey: "00002000", latitude: 42.1, longitude: 3, name: "B", notes: null, type: "position" },
    { id: "c", dayId: "d1", orderKey: "00003000", latitude: 42.2, longitude: 3, name: "C", notes: null, type: "stop" },
  ],
}

async function pulledDatabase() {
  const database = createTestDatabase()
  mockApiGet.mockResolvedValue(SERVER_ROUTE)
  await pullRoute("trip-1", database)
  return database
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("editRoute", () => {
  it("applies an edit to the local route at once, signal or not", async () => {
    const database = await pulledDatabase()

    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Cala Bona" }), database)

    const route = await loadEditableRoute("trip-1", database)
    expect(route.points.find((point) => point.id === "b")!.name).toBe("Cala Bona")
  })

  it("marks the route as having changes to push", async () => {
    const database = await pulledDatabase()

    await editRoute("trip-1", (route) => deletePoint(route, "b"), database)

    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({
      routeVersion: 4,
      hasLocalChanges: true,
      inConflict: false,
    })
    const route = await loadEditableRoute("trip-1", database)
    expect(route.points.map((point) => point.id).sort()).toEqual(["a", "c"])
  })

  // The pull replaces the route wholesale; it must not throw away an edit made
  // at sea before it has been pushed.
  it("keeps a pull from overwriting an edit that has not been pushed", async () => {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Mine" }), database)

    await pullRoute("trip-1", database)

    const route = await loadEditableRoute("trip-1", database)
    expect(route.points.find((point) => point.id === "b")!.name).toBe("Mine")
  })
})

describe("pushRouteChanges", () => {
  it("pushes the whole edited route against the version it was based on", async () => {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => deletePoint(route, "b"), database)
    mockApiPost.mockResolvedValue({ routeVersion: 5 })

    const outcome = await pushRouteChanges("trip-1", database)

    expect(outcome).toBe("pushed")
    const [path, body] = mockApiPost.mock.calls[0]
    expect(path).toBe("/api/sync/trip/trip-1/route/push")
    expect(body.baseRouteVersion).toBe(4)
    expect(body.points.map((point: { id: string }) => point.id)).toEqual(["a", "c"])
    expect(body.days[0]).toMatchObject({ id: "d1", startPointId: "a", endPointId: "c" })
    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({
      routeVersion: 5,
      hasLocalChanges: false,
    })
  })

  it("pushes nothing when the route has no changes", async () => {
    const database = await pulledDatabase()

    expect(await pushRouteChanges("trip-1", database)).toBe("nothing")
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  // Someone changed the route on the web meanwhile: never merged automatically,
  // parked for the leader to compare, and the phone keeps its own route.
  it("parks a route that changed elsewhere, keeping the phone's version", async () => {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Mine" }), database)
    mockApiPost.mockRejectedValue(new ApiError("Route has diverged", 409))

    expect(await pushRouteChanges("trip-1", database)).toBe("conflict")

    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({ inConflict: true })
    await pullRoute("trip-1", database)
    const route = await loadEditableRoute("trip-1", database)
    expect(route.points.find((point) => point.id === "b")!.name).toBe("Mine")
  })

  it("does not push again while the conflict is parked", async () => {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Mine" }), database)
    mockApiPost.mockRejectedValue(new ApiError("Route has diverged", 409))
    await pushRouteChanges("trip-1", database)
    mockApiPost.mockClear()

    expect(await pushRouteChanges("trip-1", database)).toBe("conflict")
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("keeps the change to push later when there is no connection", async () => {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Mine" }), database)
    mockApiPost.mockRejectedValue(new Error("Could not reach the server."))

    await expect(pushRouteChanges("trip-1", database)).rejects.toThrow()

    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({
      hasLocalChanges: true,
      inConflict: false,
    })
  })
})

describe("resolveRouteConflict", () => {
  async function conflicted() {
    const database = await pulledDatabase()
    await editRoute("trip-1", (route) => editPoint(route, "b", { name: "Mine" }), database)
    mockApiPost.mockRejectedValue(new ApiError("Route has diverged", 409))
    await pushRouteChanges("trip-1", database)
    mockApiPost.mockReset()
    return database
  }

  it("keeping mine sends the phone's route as the resolution", async () => {
    const database = await conflicted()
    mockApiPost.mockResolvedValue({ routeVersion: 7 })

    await resolveRouteConflict("trip-1", "mine", database)

    expect(mockApiPost.mock.calls[0][0]).toBe("/api/sync/trip/trip-1/route/resolve")
    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({
      routeVersion: 7,
      hasLocalChanges: false,
      inConflict: false,
    })
  })

  it("keeping theirs replaces the phone's route with the server's", async () => {
    const database = await conflicted()
    mockApiGet.mockResolvedValue({ ...SERVER_ROUTE, routeVersion: 6 })

    await resolveRouteConflict("trip-1", "theirs", database)

    const route = await loadEditableRoute("trip-1", database)
    expect(route.points.find((point) => point.id === "b")!.name).toBe("B")
    expect(await loadRouteSyncState("trip-1", database)).toMatchObject({
      routeVersion: 6,
      hasLocalChanges: false,
      inConflict: false,
    })
  })
})
