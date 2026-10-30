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
      [],
      database,
    )
    await saveRequirementsCache(
      "trip-2",
      [{ id: "req-2", name: "Stove", status: "needed" }] as never,
      [],
      database,
    )

    expect(await loadRequirementsCache("trip-1", database)).toEqual([
      { id: "req-1", name: "Tent", status: "covered", category: null },
    ])
    expect(await loadRequirementsCache("trip-2", database)).toEqual([
      { id: "req-2", name: "Stove", status: "needed", category: null },
    ])
  })

  it("wholesale-replaces only the saved trip's rows", async () => {
    const database = createTestDatabase()
    await saveRequirementsCache("trip-1", [{ id: "req-1", name: "Tent" }] as never, [], database)
    await saveRequirementsCache("trip-2", [{ id: "req-2", name: "Stove" }] as never, [], database)

    await saveRequirementsCache("trip-1", [{ id: "req-3", name: "Paddle" }] as never, [], database)

    expect((await loadRequirementsCache("trip-1", database)).map((r) => r.id)).toEqual(["req-3"])
    expect((await loadRequirementsCache("trip-2", database)).map((r) => r.id)).toEqual(["req-2"])
  })

  describe("category", () => {
    const categories = [
      { slug: "gear", name: "Gear" },
      { slug: "first_aid", name: "First Aid" },
    ]

    it("stores a slug, or the name typed by hand, as the category's name", async () => {
      const database = createTestDatabase()
      await saveRequirementsCache(
        "trip-1",
        [
          { id: "req-1", name: "Group first aid kit", category: "first_aid" },
          { id: "req-2", name: "Burn gel", category: " first aid " },
        ] as never,
        categories,
        database,
      )

      const cached = await loadRequirementsCache("trip-1", database)
      expect(cached.map((r) => r.category)).toEqual(["First Aid", "First Aid"])
    })

    it("keeps free text that matches no category as typed", async () => {
      const database = createTestDatabase()
      await saveRequirementsCache(
        "trip-1",
        [{ id: "req-1", name: "Stove", category: "My stuff" }] as never,
        categories,
        database,
      )

      expect((await loadRequirementsCache("trip-1", database))[0].category).toBe("My stuff")
    })

    it("stores no category for a requirement that has none", async () => {
      const database = createTestDatabase()
      await saveRequirementsCache(
        "trip-1",
        [
          { id: "req-1", name: "Tent" },
          { id: "req-2", name: "Stove", category: null },
          { id: "req-3", name: "Pot", category: "  " },
        ] as never,
        categories,
        database,
      )

      const cached = await loadRequirementsCache("trip-1", database)
      expect(cached.map((r) => r.category)).toEqual([null, null, null])
    })

    it("falls back to the stored value when the categories could not be fetched", async () => {
      const database = createTestDatabase()
      await saveRequirementsCache(
        "trip-1",
        [{ id: "req-1", name: "Kit", category: "first_aid" }] as never,
        [],
        database,
      )

      expect((await loadRequirementsCache("trip-1", database))[0].category).toBe("first_aid")
    })
  })

  it("returns an empty list when nothing has ever been cached for that trip", async () => {
    const database = createTestDatabase()
    expect(await loadRequirementsCache("trip-1", database)).toEqual([])
  })
})
