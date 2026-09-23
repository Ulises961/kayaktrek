import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { DISTANCE_UNIT } from "@shared/itinerary/distance"

import { CACHE_KEY, readCachedAt } from "../cache-freshness"
import { CachedProfileEntry, modelClasses } from "../models"
import { loadLogStatsCache, loadMeCache, saveLogStatsCache, saveMeCache } from "../profile-cache"
import { appDatabaseSchema } from "../schema"

jest.mock("../database", () => ({ database: {} }))

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

const LOG = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a05",
  date: "2026-06-01",
  distance: 12,
}

const ME = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01",
  mail: "ana@example.com",
  username: "ana",
  name: "Ana",
  surname: "Ríos",
  phone: "+34 600 000 000",
  bio: "Sea kayaker.",
  homeLocation: "Vigo",
  profileIsPublic: true,
  unitPreference: DISTANCE_UNIT.KM,
  certifications: [
    {
      id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02",
      award: "4 Star Sea",
      organization: "Paddle UK",
      validUntil: "2028-01-01",
    },
  ],
  logs: [LOG],
  endorsedLogs: [LOG],
}

const STATS = {
  totalDistance: 120.5,
  totalHours: 30,
  logCount: 9,
  tripCount: 3,
  endorsementsReceived: 2,
  conditionsDistribution: { "3": 4 },
  activityByMonth: [{ month: "2026-06", distance: 40, hours: 10, count: 3 }],
}

// Tier 4: the paddler's own record, for Profile, Settings and the drawer
// header — the last screens that still went blank offline.
describe("profile cache", () => {
  it("saves and reads back the paddler's own record", async () => {
    const database = createTestDatabase()

    await saveMeCache(ME, database)

    const cached = await loadMeCache(database)
    expect(cached).toMatchObject({
      username: "ana",
      mail: "ana@example.com",
      phone: "+34 600 000 000",
      unitPreference: DISTANCE_UNIT.KM,
      profileIsPublic: true,
    })
    expect(cached?.certifications?.[0]).toMatchObject({ award: "4 Star Sea" })
  })

  // /user/me dumps every log, endorsed log and itinerary the user has. Those
  // have caches of their own, and nothing reading this one renders them.
  it("leaves the nested collections out of the stored copy", async () => {
    const database = createTestDatabase()

    await saveMeCache(ME, database)

    const cached = await loadMeCache(database)
    expect(cached?.logs).toBeUndefined()
    expect(cached?.endorsedLogs).toBeUndefined()
  })

  it("keeps a single record, replaced on every save", async () => {
    const database = createTestDatabase()
    await saveMeCache(ME, database)

    await saveMeCache({ ...ME, unitPreference: DISTANCE_UNIT.NM }, database)

    expect((await loadMeCache(database))?.unitPreference).toBe(DISTANCE_UNIT.NM)
    expect(
      await database.collections.get<CachedProfileEntry>("cached_profile").query().fetchCount(),
    ).toBe(1)
  })

  it("records when the record was cached", async () => {
    const database = createTestDatabase()

    await saveMeCache(ME, database)

    expect(await readCachedAt(CACHE_KEY.me, database)).not.toBeNull()
  })

  it("reads null before anything was cached", async () => {
    const database = createTestDatabase()

    expect(await loadMeCache(database)).toBeNull()
    expect(await loadLogStatsCache(database)).toBeNull()
  })

  it("stores the log stats beside the record without disturbing it", async () => {
    const database = createTestDatabase()
    await saveMeCache(ME, database)

    await saveLogStatsCache(STATS, database)

    expect(await loadLogStatsCache(database)).toEqual(STATS)
    expect((await loadMeCache(database))?.username).toBe("ana")
    expect(await readCachedAt(CACHE_KEY.logStats, database)).not.toBeNull()
  })

  // The DTO can change shape between an app update and the next sweep. A
  // record that no longer parses reads as nothing cached, not as a crash.
  it("reads null when the stored record no longer parses", async () => {
    const database = createTestDatabase()
    await saveMeCache(ME, database)
    const [row] = await database.collections
      .get<CachedProfileEntry>("cached_profile")
      .query()
      .fetch()
    await database.write(async () => {
      await row.update((record) => {
        record.payload = JSON.stringify({ username: 42 })
      })
    })

    expect(await loadMeCache(database)).toBeNull()
  })
})
