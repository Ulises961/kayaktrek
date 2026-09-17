import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses } from "../models"
import { loadRequirementsCache, saveRequirementsCache } from "../requirements-cache"
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

describe("requirements cache", () => {
  it("saves and reads back a trip's requirements, unaffected by another trip", async () => {
    const database = createTestDatabase()
    await saveRequirementsCache(
      "trip-1",
      [{ id: "req-1", name: "Tent", status: "covered" }] as never,
      database,
    )
    await saveRequirementsCache(
      "trip-2",
      [{ id: "req-2", name: "Stove", status: "needed" }] as never,
      database,
    )

    expect(await loadRequirementsCache("trip-1", database)).toEqual([
      { id: "req-1", name: "Tent", status: "covered" },
    ])
    expect(await loadRequirementsCache("trip-2", database)).toEqual([
      { id: "req-2", name: "Stove", status: "needed" },
    ])
  })

  it("wholesale-replaces only the saved trip's rows", async () => {
    const database = createTestDatabase()
    await saveRequirementsCache("trip-1", [{ id: "req-1", name: "Tent" }] as never, database)
    await saveRequirementsCache("trip-2", [{ id: "req-2", name: "Stove" }] as never, database)

    await saveRequirementsCache("trip-1", [{ id: "req-3", name: "Paddle" }] as never, database)

    expect((await loadRequirementsCache("trip-1", database)).map((r) => r.id)).toEqual(["req-3"])
    expect((await loadRequirementsCache("trip-2", database)).map((r) => r.id)).toEqual(["req-2"])
  })

  it("returns an empty list when nothing has ever been cached for that trip", async () => {
    const database = createTestDatabase()
    expect(await loadRequirementsCache("trip-1", database)).toEqual([])
  })
})
