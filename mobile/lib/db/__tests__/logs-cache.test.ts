import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses } from "../models"
import { loadLogsCache, saveLogsCache } from "../logs-cache"
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
