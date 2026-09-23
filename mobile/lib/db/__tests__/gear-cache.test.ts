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
      { id: "item-1", name: "Dry bag", status: "owned", categoryName: null, defaultPack: false },
      {
        id: "item-2",
        name: "Spare paddle",
        status: "suggested",
        categoryName: null,
        defaultPack: false,
      },
    ])
  })

  // Added when the Gear screen shipped (M30 WP5). This cache was written when
  // the only offline reader was the Items screen's contribute list, which needs
  // a name and nothing else — the Gear screen groups by category and renders
  // M10's default-pack flag, and both were being dropped on the way in.
  it("carries the category and default-pack flag the Gear screen renders", async () => {
    const database = createTestDatabase()

    await saveGearCache(
      [
        {
          id: "item-1",
          name: "Dry bag",
          status: "owned",
          category: { id: "cat-1", name: "Storage", slug: "storage" },
          defaultPack: true,
        },
      ] as never,
      database,
    )

    expect(await loadGearCache(database)).toEqual([
      {
        id: "item-1",
        name: "Dry bag",
        status: "owned",
        categoryName: "Storage",
        defaultPack: true,
      },
    ])
  })

  // An absent flag must read as false, never as "unknown" rendered like true:
  // default-pack decides what gets suggested onto a future trip, so a wrong
  // active state offline would misrepresent what the next trip will look like.
  it("reads a missing default-pack flag as off rather than unset", async () => {
    const database = createTestDatabase()

    await saveGearCache([{ id: "item-1", name: "Dry bag" }] as never, database)

    const [gear] = await loadGearCache(database)
    expect(gear.defaultPack).toBe(false)
    expect(gear.categoryName).toBeNull()
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
