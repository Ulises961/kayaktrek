import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses, VelocityDay, VelocityHour } from "../models"
import { appDatabaseSchema } from "../schema"
import { hasCachedVelocity, loadCachedVelocityField } from "../velocity-cache"

jest.mock("../database", () => ({ database: {} }))

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

async function saveDay(database: Database, dayId: string, landMask = "0010") {
  await database.write(() =>
    database.collections.get<VelocityDay>("velocity_days").create((record) => {
      record.dayId = dayId
      record.south = 53.5
      record.north = 54.7
      record.west = -5.2
      record.east = -3.8
      record.size = 2
      record.landMask = landMask
    }),
  )
}

async function saveHour(
  database: Database,
  dayId: string,
  hour: number,
  flow: { windU: number | null; windV: number | null; waveU: number | null; waveV: number | null },
) {
  await database.write(() =>
    database.collections.get<VelocityHour>("velocity_hours").create((record) => {
      record.dayId = dayId
      record.hour = hour
      record.windU = flow.windU
      record.windV = flow.windV
      record.waveU = flow.waveU
      record.waveV = flow.waveV
    }),
  )
}

const FLOW = { windU: -10, windV: 0.5, waveU: -0.7, waveV: -1.9 }

describe("hasCachedVelocity", () => {
  it("is true once a day's velocity has been pulled, and false for any other day", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1")

    expect(await hasCachedVelocity("day-1", database)).toBe(true)
    expect(await hasCachedVelocity("day-2", database)).toBe(false)
  })
})

describe("loadCachedVelocityField", () => {
  it("is undefined when nothing has been pulled for the day, so the caller knows to ask the server", async () => {
    const database = createTestDatabase()

    expect(await loadCachedVelocityField("day-1", 12, "wind", database)).toBeUndefined()
  })

  it("rebuilds the wind and the wave field for the day and hour asked for", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1")
    await saveHour(database, "day-1", 12, FLOW)
    await saveHour(database, "day-1", 13, { windU: 3, windV: 4, waveU: 5, waveV: 6 })

    const wind = await loadCachedVelocityField("day-1", 12, "wind", database)
    const wave = await loadCachedVelocityField("day-1", 12, "wave", database)

    expect(wind).toMatchObject({ north: 54.7, south: 53.5, west: -5.2, east: -3.8, nx: 2, ny: 2 })
    expect(wind?.u).toEqual([-10, -10, -10, -10])
    expect(wave?.u).toEqual([-0.7, -0.7, null, -0.7])
    expect(wave?.v).toEqual([-1.9, -1.9, null, -1.9])
  })

  it("keeps one day's hours out of another's", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1")
    await saveDay(database, "day-2")
    await saveHour(database, "day-1", 12, FLOW)
    await saveHour(database, "day-2", 12, { windU: 1, windV: 1, waveU: 1, waveV: 1 })

    const field = await loadCachedVelocityField("day-2", 12, "wind", database)

    expect(field?.u).toEqual([1, 1, 1, 1])
  })

  it("is null, not undefined, when the day was pulled but has no forecast for the layer", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1")
    await saveHour(database, "day-1", 12, { ...FLOW, waveU: null, waveV: null })

    expect(await loadCachedVelocityField("day-1", 12, "wave", database)).toBeNull()
    expect(await loadCachedVelocityField("day-1", 12, "wind", database)).not.toBeNull()
  })

  it("is null when the day was pulled but that hour was not", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1")

    expect(await loadCachedVelocityField("day-1", 5, "wind", database)).toBeNull()
  })

  it("throws for a mask that does not fit the grid, so the caller does not trust the cache", async () => {
    const database = createTestDatabase()
    await saveDay(database, "day-1", "001")
    await saveHour(database, "day-1", 12, FLOW)

    await expect(loadCachedVelocityField("day-1", 12, "wave", database)).rejects.toThrow(/damaged/i)
  })
})
