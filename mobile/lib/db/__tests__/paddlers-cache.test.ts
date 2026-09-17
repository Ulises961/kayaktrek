import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses } from "../models"
import { loadBlocksCache, loadConnectionsCache, saveBlocksCache, saveConnectionsCache } from "../paddlers-cache"
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

describe("connections cache", () => {
  it("saves and reads back a buddy list", async () => {
    const database = createTestDatabase()
    await saveConnectionsCache(
      [
        {
          id: "conn-1",
          status: "accepted",
          requester: { id: "user-1", username: "alice", name: "Alice", surname: "A" },
          addressee: { id: "user-2", username: "bob", name: "Bob", surname: null },
        },
      ] as never,
      database,
    )

    const cached = await loadConnectionsCache(database)
    expect(cached).toEqual([
      {
        id: "conn-1",
        status: "accepted",
        requester: { id: "user-1", username: "alice", name: "Alice", surname: "A" },
        addressee: { id: "user-2", username: "bob", name: "Bob", surname: null },
      },
    ])
  })

  it("wholesale-replaces the cache on a second save", async () => {
    const database = createTestDatabase()
    await saveConnectionsCache(
      [
        {
          id: "conn-1",
          status: "accepted",
          requester: { id: "u1", username: "a", name: "A" },
          addressee: { id: "u2", username: "b", name: "B" },
        },
      ] as never,
      database,
    )
    await saveConnectionsCache(
      [
        {
          id: "conn-2",
          status: "pending",
          requester: { id: "u3", username: "c", name: "C" },
          addressee: { id: "u4", username: "d", name: "D" },
        },
      ] as never,
      database,
    )

    const cached = await loadConnectionsCache(database)
    expect(cached.map((c) => c.id)).toEqual(["conn-2"])
  })

  it("returns an empty list when nothing has ever been cached", async () => {
    const database = createTestDatabase()
    expect(await loadConnectionsCache(database)).toEqual([])
  })
})

describe("blocks cache", () => {
  it("saves and reads back a block list", async () => {
    const database = createTestDatabase()
    await saveBlocksCache(
      [{ id: "block-1", blocked: { id: "user-3", username: "carl", name: "Carl", surname: null } }] as never,
      database,
    )

    const cached = await loadBlocksCache(database)
    expect(cached).toEqual([
      { id: "block-1", blocked: { id: "user-3", username: "carl", name: "Carl", surname: null } },
    ])
  })

  it("wholesale-replaces the cache on a second save", async () => {
    const database = createTestDatabase()
    await saveBlocksCache([{ id: "block-1", blocked: { id: "u1", username: "a", name: "A" } }] as never, database)
    await saveBlocksCache([{ id: "block-2", blocked: { id: "u2", username: "b", name: "B" } }] as never, database)

    const cached = await loadBlocksCache(database)
    expect(cached.map((b) => b.id)).toEqual(["block-2"])
  })
})
