import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { apiGet } from "../../api/client"
import { modelClasses, TripMember, VelocityDay, VelocityHour, Weather } from "../models"
import { appDatabaseSchema } from "../schema"
import { syncTrip } from "../sync"

jest.mock("../../api/client", () => ({ apiGet: jest.fn() }))
// database.ts eagerly constructs a native SQLiteAdapter at import time — never
// usable under Jest. syncTrip always takes an explicit test database below,
// so the production export just needs to import cleanly.
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

describe("syncTrip", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("requests the trip's pull endpoint and applies camelCase rows under their snake_case columns", async () => {
    mockedApiGet.mockResolvedValueOnce({
      changes: {
        trip_members: {
          created: [
            {
              id: "member-1",
              tripId: "trip-1",
              userId: "user-1",
              role: "leader",
              nominatedSuccessor: false,
              vesselMake: "Valley",
              vesselModel: null,
              vesselLengthCm: null,
              vesselColorPrimary: null,
              vesselColorSecondary: null,
              emergencyContactName: "Jane Doe",
              emergencyContactPhone: null,
              emergencyContactRelationship: null,
              floatPlanConfirmedAt: null,
            },
          ],
          updated: [],
          deleted: [],
        },
        requirement_contributions: { created: [], updated: [], deleted: [] },
        weather: {
          created: [{ id: "day-1", dayId: "day-1", model: "open-meteo", fetchedAt: 1_700_000_000_000 }],
          updated: [],
          deleted: [],
        },
        weather_states: { created: [], updated: [], deleted: [] },
        sea: { created: [], updated: [], deleted: [] },
        sea_states: { created: [], updated: [], deleted: [] },
      },
      timestamp: 1_700_000_000_500,
    })

    const database = createTestDatabase()
    await syncTrip("trip-1", database)

    expect(mockedApiGet).toHaveBeenCalledWith("/api/sync/trip/trip-1/pull")

    const tripMembers = database.collections.get<TripMember>("trip_members")
    const member = await tripMembers.find("member-1")
    expect(member.tripId).toBe("trip-1")
    expect(member.vesselMake).toBe("Valley")
    expect(member.emergencyContactName).toBe("Jane Doe")

    const weather = database.collections.get<Weather>("weather")
    const weatherRow = await weather.find("day-1")
    expect(weatherRow.model).toBe("open-meteo")
    expect(weatherRow.fetchedAt).toBe(1_700_000_000_000)
  })

  // M35: the pull carries each day's wind and swell flow (a box, a land mask and 24 hours of
  // u/v) so the map overlay can draw without a connection. They are sent whole every time.
  it("keeps the velocity rows a pull carries, and updates them on the next pull", async () => {
    const velocityChanges = (dayRow: Record<string, unknown>, hourRow: Record<string, unknown>, bucket: "created" | "updated") => ({
      changes: {
        velocity_days: { created: bucket === "created" ? [dayRow] : [], updated: bucket === "updated" ? [dayRow] : [], deleted: [] },
        velocity_hours: { created: bucket === "created" ? [hourRow] : [], updated: bucket === "updated" ? [hourRow] : [], deleted: [] },
      },
      timestamp: 1_700_000_000_500,
    })
    const dayRow = { id: "day-1", dayId: "day-1", south: 53.5, north: 54.7, west: -5.2, east: -3.8, size: 2, landMask: "0100" }
    const hourRow = { id: "day-1:12", dayId: "day-1", hour: 12, windU: -10, windV: 0, waveU: null, waveV: null }
    const database = createTestDatabase()

    mockedApiGet.mockResolvedValueOnce(velocityChanges(dayRow, hourRow, "created"))
    await syncTrip("trip-1", database)
    mockedApiGet.mockResolvedValueOnce(
      velocityChanges({ ...dayRow, north: 55.1 }, { ...hourRow, windU: -6, waveU: 0.5, waveV: -1.2 }, "updated"),
    )
    await syncTrip("trip-1", database)

    const day = await database.collections.get<VelocityDay>("velocity_days").find("day-1")
    expect([day.dayId, day.south, day.north, day.west, day.east, day.size, day.landMask]).toEqual([
      "day-1", 53.5, 55.1, -5.2, -3.8, 2, "0100",
    ])
    const hour = await database.collections.get<VelocityHour>("velocity_hours").find("day-1:12")
    expect([hour.dayId, hour.hour, hour.windU, hour.windV, hour.waveU, hour.waveV]).toEqual([
      "day-1", 12, -6, 0, 0.5, -1.2,
    ])
  })

  it("passes lastPulledAt through on a subsequent sync", async () => {
    mockedApiGet.mockResolvedValueOnce({
      changes: {
        trip_members: { created: [], updated: [], deleted: [] },
        requirement_contributions: { created: [], updated: [], deleted: [] },
        weather: { created: [], updated: [], deleted: [] },
        weather_states: { created: [], updated: [], deleted: [] },
        sea: { created: [], updated: [], deleted: [] },
        sea_states: { created: [], updated: [], deleted: [] },
      },
      timestamp: 1_700_000_000_000,
    })
    const database = createTestDatabase()
    await syncTrip("trip-1", database)

    mockedApiGet.mockResolvedValueOnce({
      changes: {
        trip_members: { created: [], updated: [], deleted: [] },
        requirement_contributions: { created: [], updated: [], deleted: [] },
        weather: { created: [], updated: [], deleted: [] },
        weather_states: { created: [], updated: [], deleted: [] },
        sea: { created: [], updated: [], deleted: [] },
        sea_states: { created: [], updated: [], deleted: [] },
      },
      timestamp: 1_700_000_001_000,
    })
    await syncTrip("trip-1", database)

    expect(mockedApiGet).toHaveBeenNthCalledWith(2, "/api/sync/trip/trip-1/pull?lastPulledAt=1700000000000")
  })

  it("keeps a separate cursor per trip, so syncing trip B never inherits trip A's lastPulledAt", async () => {
    const empty = {
      trip_members: { created: [], updated: [], deleted: [] },
      requirement_contributions: { created: [], updated: [], deleted: [] },
      weather: { created: [], updated: [], deleted: [] },
      weather_states: { created: [], updated: [], deleted: [] },
      sea: { created: [], updated: [], deleted: [] },
      sea_states: { created: [], updated: [], deleted: [] },
    }
    const database = createTestDatabase()

    mockedApiGet.mockResolvedValueOnce({ changes: empty, timestamp: 1_700_000_000_000 })
    await syncTrip("trip-a", database)

    // A second, never-before-synced trip must still pull from scratch (no
    // lastPulledAt) — not from trip A's cursor.
    mockedApiGet.mockResolvedValueOnce({ changes: empty, timestamp: 1_700_000_005_000 })
    await syncTrip("trip-b", database)
    expect(mockedApiGet).toHaveBeenNthCalledWith(2, "/api/sync/trip/trip-b/pull")

    // Re-syncing trip A afterwards must still use trip A's own cursor, not
    // trip B's more recent one.
    mockedApiGet.mockResolvedValueOnce({ changes: empty, timestamp: 1_700_000_006_000 })
    await syncTrip("trip-a", database)
    expect(mockedApiGet).toHaveBeenNthCalledWith(3, "/api/sync/trip/trip-a/pull?lastPulledAt=1700000000000")
  })
})

// Found on a real device: a trip reported a successful sync, recorded a
// freshness timestamp, and had no crew at all. Its cursor had been advanced by
// an earlier attempt whose changes never reached the local database, so every
// later pull asked "what changed since then?" and the backend correctly
// answered "nothing" — for rows it had never delivered. The crew was
// permanently missing until something changed server-side.
//
// This is the same class of bug as the per-trip cursor fix in b181d85a: a
// cursor that advances for data that never landed. There it was the wrong
// cursor; here it is the right cursor written at the wrong moment.
