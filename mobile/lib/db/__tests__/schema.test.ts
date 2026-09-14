import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses, Day, Point, TripMember, RequirementContribution, Weather, WeatherState, Sea, SeaState } from "../models"
import { appDatabaseSchema } from "../schema"

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

describe("local sync schema", () => {
  it("writes and reads a day and a point referencing it", async () => {
    const database = createTestDatabase()
    const days = database.collections.get<Day>("days")
    const points = database.collections.get<Point>("points")

    const day = await database.write(() =>
      days.create((record) => {
        record.dayNumber = 1
        record.date = "2026-09-14"
      })
    )
    const point = await database.write(() =>
      points.create((record) => {
        record.dayId = day.id
        record.orderKey = "m"
        record.latitude = 44.1
        record.longitude = 8.5
        record.type = "position"
      })
    )

    const fetchedPoint = await points.find(point.id)
    expect(fetchedPoint.dayId).toBe(day.id)
    expect(fetchedPoint.orderKey).toBe("m")
    expect(fetchedPoint.latitude).toBe(44.1)
  })

  it("writes and reads a trip member with vessel/emergency-contact fields", async () => {
    const database = createTestDatabase()
    const tripMembers = database.collections.get<TripMember>("trip_members")

    const member = await database.write(() =>
      tripMembers.create((record) => {
        record.tripId = "trip-1"
        record.userId = "user-1"
        record.role = "leader"
        record.nominatedSuccessor = false
        record.vesselMake = "Valley"
        record.emergencyContactName = "Jane Doe"
      })
    )

    const fetched = await tripMembers.find(member.id)
    expect(fetched.role).toBe("leader")
    expect(fetched.vesselMake).toBe("Valley")
    expect(fetched.emergencyContactName).toBe("Jane Doe")
  })

  it("writes and reads a requirement contribution", async () => {
    const database = createTestDatabase()
    const contributions = database.collections.get<RequirementContribution>("requirement_contributions")

    const contribution = await database.write(() =>
      contributions.create((record) => {
        record.requirementId = "req-1"
        record.tripMemberId = "member-1"
        record.itemId = "item-1"
        record.checked = true
      })
    )

    const fetched = await contributions.find(contribution.id)
    expect(fetched.checked).toBe(true)
  })

  it("writes and reads weather and a weather state for the same day", async () => {
    const database = createTestDatabase()
    const weather = database.collections.get<Weather>("weather")
    const weatherStates = database.collections.get<WeatherState>("weather_states")

    const weatherRow = await database.write(() =>
      weather.create((record) => {
        record.dayId = "day-1"
        record.model = "open-meteo"
        record.fetchedAt = 1_700_000_000_000
      })
    )
    const stateRow = await database.write(() =>
      weatherStates.create((record) => {
        record.dayId = weatherRow.dayId
        record.time = "12:00:00"
        record.temperature = 18.5
        record.windForce = 3
      })
    )

    const fetchedState = await weatherStates.find(stateRow.id)
    expect(fetchedState.dayId).toBe("day-1")
    expect(fetchedState.temperature).toBe(18.5)
  })

  it("writes and reads sea and a sea state for the same day", async () => {
    const database = createTestDatabase()
    const sea = database.collections.get<Sea>("sea")
    const seaStates = database.collections.get<SeaState>("sea_states")

    const seaRow = await database.write(() =>
      sea.create((record) => {
        record.dayId = "day-1"
        record.moonPhase = "new"
        record.highTide = "06:30:00"
        record.recordedAt = 1_700_000_000_000
      })
    )
    const stateRow = await database.write(() =>
      seaStates.create((record) => {
        record.dayId = seaRow.dayId
        record.time = "12:00:00"
        record.waveHeight = 0.8
      })
    )

    const fetchedState = await seaStates.find(stateRow.id)
    expect(fetchedState.waveHeight).toBe(0.8)
  })
})
