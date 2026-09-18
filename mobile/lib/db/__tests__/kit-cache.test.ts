import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { loadKitCache, saveKitCache } from "../kit-cache"
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

// The kit is a member's private per-trip packing list (PersonalPackingItem),
// so it is trip-scoped the same way requirements are — distinct from the gear
// closet it draws from, which is trip-independent.
describe("kit cache", () => {
  it("saves and reads back a trip's kit, unaffected by another trip", async () => {
    const database = createTestDatabase()

    await saveKitCache(
      "trip-1",
      [{ id: "pack-1", checked: true, item: { id: "item-1", name: "Dry bag" } }] as never,
      database,
    )
    await saveKitCache(
      "trip-2",
      [{ id: "pack-2", checked: false, item: { id: "item-2", name: "Spare paddle" } }] as never,
      database,
    )

    expect(await loadKitCache("trip-1", database)).toEqual([
      { id: "pack-1", itemId: "item-1", itemName: "Dry bag", checked: true },
    ])
    expect(await loadKitCache("trip-2", database)).toEqual([
      { id: "pack-2", itemId: "item-2", itemName: "Spare paddle", checked: false },
    ])
  })

  it("wholesale-replaces only the saved trip's rows", async () => {
    const database = createTestDatabase()
    await saveKitCache(
      "trip-1",
      [{ id: "pack-1", checked: false, item: { id: "item-1", name: "Dry bag" } }] as never,
      database,
    )
    await saveKitCache(
      "trip-2",
      [{ id: "pack-2", checked: false, item: { id: "item-2", name: "Spare paddle" } }] as never,
      database,
    )

    await saveKitCache(
      "trip-1",
      [{ id: "pack-3", checked: true, item: { id: "item-3", name: "Tow line" } }] as never,
      database,
    )

    expect((await loadKitCache("trip-1", database)).map((entry) => entry.id)).toEqual(["pack-3"])
    expect((await loadKitCache("trip-2", database)).map((entry) => entry.id)).toEqual(["pack-2"])
  })

  it("keeps the packed/unpacked state, which is the whole point of reading it at the put-in", async () => {
    const database = createTestDatabase()

    await saveKitCache(
      "trip-1",
      [
        { id: "pack-1", checked: true, item: { id: "item-1", name: "Dry bag" } },
        { id: "pack-2", checked: false, item: { id: "item-2", name: "Spare paddle" } },
      ] as never,
      database,
    )

    const cached = await loadKitCache("trip-1", database)
    expect(cached.find((entry) => entry.id === "pack-1")?.checked).toBe(true)
    expect(cached.find((entry) => entry.id === "pack-2")?.checked).toBe(false)
  })

  it("survives a packing entry whose item was never expanded by the API", async () => {
    const database = createTestDatabase()

    await saveKitCache("trip-1", [{ id: "pack-1", checked: false }] as never, database)

    expect(await loadKitCache("trip-1", database)).toEqual([
      { id: "pack-1", itemId: null, itemName: "Item", checked: false },
    ])
  })

  it("returns an empty list when nothing has ever been cached for that trip", async () => {
    const database = createTestDatabase()
    expect(await loadKitCache("trip-1", database)).toEqual([])
  })
})
