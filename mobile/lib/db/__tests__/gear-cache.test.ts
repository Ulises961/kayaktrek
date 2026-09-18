import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { loadGearCache, saveGearCache } from "../gear-cache"
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

// Gear is the user's trip-independent Item closet, so unlike the kit and
// requirement caches there is no trip to scope by — the whole table is one
// user's gear and replaces wholesale, the same shape as trip-list-cache.
describe("gear cache", () => {
  it("saves and reads back the user's gear", async () => {
    const database = createTestDatabase()

    await saveGearCache(
      [
        { id: "item-1", name: "Dry bag", status: "owned" },
        { id: "item-2", name: "Spare paddle", status: "suggested" },
      ] as never,
      database,
    )

    expect(await loadGearCache(database)).toEqual([
      { id: "item-1", name: "Dry bag", status: "owned" },
      { id: "item-2", name: "Spare paddle", status: "suggested" },
    ])
  })

  it("replaces the whole closet rather than accumulating removed gear", async () => {
    const database = createTestDatabase()
    await saveGearCache([{ id: "item-1", name: "Dry bag", status: "owned" }] as never, database)

    await saveGearCache([{ id: "item-2", name: "Spare paddle", status: "owned" }] as never, database)

    expect((await loadGearCache(database)).map((item) => item.id)).toEqual(["item-2"])
  })

  it("skips gear with no id, which cannot be matched against a packing entry", async () => {
    const database = createTestDatabase()

    await saveGearCache(
      [{ name: "Nameless", status: "owned" }, { id: "item-1", name: "Dry bag", status: "owned" }] as never,
      database,
    )

    expect((await loadGearCache(database)).map((item) => item.id)).toEqual(["item-1"])
  })

  it("returns an empty list when nothing has ever been cached", async () => {
    const database = createTestDatabase()
    expect(await loadGearCache(database)).toEqual([])
  })
})
