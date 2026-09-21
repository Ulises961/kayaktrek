import { Database, Q } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { CACHE_KEY, markCacheFresh, readCachedAt } from "../cache-freshness"
import { modelClasses } from "../models"
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

describe("cache freshness", () => {
  it("reads back nothing for a key that was never marked", async () => {
    const database = createTestDatabase()
    expect(await readCachedAt(CACHE_KEY.tripList, database)).toBeNull()
  })

  it("reads back the marked time as an ISO timestamp", async () => {
    const database = createTestDatabase()
    const at = new Date("2026-09-20T08:30:00.000Z")

    await markCacheFresh(CACHE_KEY.tripList, database, at)

    expect(await readCachedAt(CACHE_KEY.tripList, database)).toBe("2026-09-20T08:30:00.000Z")
  })

  it("updates a key in place rather than accumulating a row per refresh", async () => {
    const database = createTestDatabase()

    await markCacheFresh(CACHE_KEY.tripList, database, new Date("2026-09-19T08:00:00.000Z"))
    await markCacheFresh(CACHE_KEY.tripList, database, new Date("2026-09-20T08:00:00.000Z"))

    expect(await readCachedAt(CACHE_KEY.tripList, database)).toBe("2026-09-20T08:00:00.000Z")
    // The row count is the assertion that matters: a cache refreshed on every
    // foreground would otherwise grow this table forever, and `readCachedAt`
    // would start reporting whichever row the query happened to return first.
    const rows = await database.collections
      .get("cache_freshness")
      .query(Q.where("key", CACHE_KEY.tripList))
      .fetch()
    expect(rows).toHaveLength(1)
  })

  it("keeps separate keys independent, including per-trip ones", async () => {
    const database = createTestDatabase()

    await markCacheFresh(CACHE_KEY.tripRoute("trip-1"), database, new Date("2026-09-18T00:00:00.000Z"))
    await markCacheFresh(CACHE_KEY.tripRoute("trip-2"), database, new Date("2026-09-20T00:00:00.000Z"))
    await markCacheFresh(CACHE_KEY.logs, database, new Date("2026-09-19T00:00:00.000Z"))

    expect(await readCachedAt(CACHE_KEY.tripRoute("trip-1"), database)).toBe(
      "2026-09-18T00:00:00.000Z",
    )
    expect(await readCachedAt(CACHE_KEY.tripRoute("trip-2"), database)).toBe(
      "2026-09-20T00:00:00.000Z",
    )
    expect(await readCachedAt(CACHE_KEY.logs, database)).toBe("2026-09-19T00:00:00.000Z")
  })

  it("defaults to the current time when no explicit time is given", async () => {
    const database = createTestDatabase()
    const before = Date.now()

    await markCacheFresh(CACHE_KEY.gear, database)

    const cachedAt = await readCachedAt(CACHE_KEY.gear, database)
    expect(cachedAt).not.toBeNull()
    expect(Date.parse(cachedAt as string)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(cachedAt as string)).toBeLessThanOrEqual(Date.now())
  })
})
