import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses } from "../models"
import {
  loadCachedLog,
  loadLogsCache,
  removeCachedLog,
  saveLogsCache,
  upsertCachedLog,
} from "../logs-cache"
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

describe("logs cache", () => {
  it("saves and reads back 'mine' logs, unaffected by 'endorsed'", async () => {
    const database = createTestDatabase()
    await saveLogsCache(
      "mine",
      [{ id: "log-1", date: "2026-09-10", hours: 3.5, distance: 12, avgSea: 2, endorsementCount: 1 }] as never,
      database,
    )
    await saveLogsCache(
      "endorsed",
      [{ id: "log-2", date: "2026-09-11", hours: 2, distance: null, avgSea: null, endorsementCount: null }] as never,
      database,
    )

    expect(await loadLogsCache("mine", database)).toEqual([
      { id: "log-1", date: "2026-09-10", hours: 3.5, distance: 12, avgSea: 2, endorsementCount: 1 },
    ])
    expect(await loadLogsCache("endorsed", database)).toEqual([
      { id: "log-2", date: "2026-09-11", hours: 2, distance: null, avgSea: null, endorsementCount: null },
    ])
  })

  it("wholesale-replaces only the saved kind's rows", async () => {
    const database = createTestDatabase()
    await saveLogsCache("mine", [{ id: "log-1", date: "2026-09-01" }] as never, database)
    await saveLogsCache("endorsed", [{ id: "log-2", date: "2026-09-02" }] as never, database)

    await saveLogsCache("mine", [{ id: "log-3", date: "2026-09-05" }] as never, database)

    expect((await loadLogsCache("mine", database)).map((l) => l.id)).toEqual(["log-3"])
    expect((await loadLogsCache("endorsed", database)).map((l) => l.id)).toEqual(["log-2"])
  })

  it("returns an empty list when nothing has ever been cached", async () => {
    const database = createTestDatabase()
    expect(await loadLogsCache("mine", database)).toEqual([])
  })
})

// The list cached but the detail screen did not, so offline you got a list of
// logs none of which would open. `kind` is what makes a cached detail view
// possible at all: it is the only record of whether a log is the caller's own,
// since the cache carries no userId.
describe("single cached log", () => {
  it("finds a log by id and reports which list it came from", async () => {
    const database = createTestDatabase()
    await saveLogsCache("mine", [{ id: "log-1", date: "2026-09-01", hours: 3 }] as never, database)
    await saveLogsCache("endorsed", [{ id: "log-2", date: "2026-09-02" }] as never, database)

    expect(await loadCachedLog("log-1", database)).toEqual({
      id: "log-1",
      kind: "mine",
      date: "2026-09-01",
      hours: 3,
      distance: null,
      avgSea: null,
      endorsementCount: null,
    })
    expect((await loadCachedLog("log-2", database))?.kind).toBe("endorsed")
  })

  it("returns null for a log that was never cached", async () => {
    const database = createTestDatabase()
    await saveLogsCache("mine", [{ id: "log-1", date: "2026-09-01" }] as never, database)

    expect(await loadCachedLog("log-missing", database)).toBeNull()
  })
})

// M9d WP8: a log written, edited or deleted offline shows in the list at once.
describe("single-log changes", () => {
  it("adds a log written offline to 'mine'", async () => {
    const database = createTestDatabase()

    await upsertCachedLog(
      { id: "log-new", date: "2026-10-02", hours: 4, distance: 14, avgSea: 3, endorsementCount: 0 },
      "mine",
      database,
    )

    expect(await loadLogsCache("mine", database)).toEqual([
      { id: "log-new", date: "2026-10-02", hours: 4, distance: 14, avgSea: 3, endorsementCount: 0 },
    ])
  })

  it("replaces a cached log's fields when it is edited offline", async () => {
    const database = createTestDatabase()
    await saveLogsCache("mine", [{ id: "log-1", date: "2026-09-10", hours: 3, distance: 12 }] as never, database)

    await upsertCachedLog(
      { id: "log-1", date: "2026-09-10", hours: 5, distance: 12, avgSea: null, endorsementCount: null },
      "mine",
      database,
    )

    const logs = await loadLogsCache("mine", database)
    expect(logs).toHaveLength(1)
    expect(logs[0].hours).toBe(5)
  })

  it("drops a log deleted offline", async () => {
    const database = createTestDatabase()
    await saveLogsCache("mine", [{ id: "log-1", date: "2026-09-10" }] as never, database)

    await removeCachedLog("log-1", database)

    expect(await loadLogsCache("mine", database)).toEqual([])
  })
})
