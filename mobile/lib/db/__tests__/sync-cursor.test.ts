import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"
import { synchronize } from "nitromelondb/sync"

import { apiGet } from "../../api/client"
import { modelClasses } from "../models"
import { appDatabaseSchema } from "../schema"
import { syncTrip } from "../sync"

jest.mock("../../api/client", () => ({ apiGet: jest.fn() }))
jest.mock("../database", () => ({ database: {} }))
// The library's own sync engine is stubbed here, deliberately and only in this
// file: what is under test is *when sync.ts writes the cursor* relative to
// synchronize() settling, not what synchronize() itself does with a changeset.
// Trying to provoke a real apply failure from a payload proved unreliable —
// WatermelonDB tolerates duplicate and unknown records rather than rejecting —
// and a test that cannot fail is worse than no test. The real failure this
// models is the one seen on a device: "[Sync] Concurrent synchronization is not
// allowed... the later one was aborted before committing results to local
// database."
jest.mock("nitromelondb/sync", () => ({ synchronize: jest.fn() }))

const mockedApiGet = apiGet as jest.MockedFunction<typeof apiGet>
const mockedSynchronize = synchronize as jest.MockedFunction<typeof synchronize>

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

async function cursorFor(database: Database, tripId: string): Promise<number | null> {
  const rows = await database.collections.get("sync_cursors").query().fetch()
  const row = rows.find((entry) => (entry as unknown as { tripId: string }).tripId === tripId)
  return row ? (row as unknown as { lastPulledAt: number }).lastPulledAt : null
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedApiGet.mockResolvedValue({ changes: {}, timestamp: 9_000 } as never)
})

describe("syncTrip cursor ordering", () => {
  it("writes the cursor after a sync that commits", async () => {
    const database = createTestDatabase()
    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
    })

    await syncTrip("trip-1", database)

    expect(await cursorFor(database, "trip-1")).toBe(9_000)
  })

  // The bug: the cursor used to be written inside pullChanges, so it advanced
  // for rows that never reached the local database. The next pull then asked
  // "what changed since then?" and the backend correctly answered "nothing" for
  // data it had never delivered — that delta was skipped permanently. On the
  // device this showed as a trip reporting a successful sync, recording a
  // freshness timestamp, and having no crew at all.
  it("leaves no cursor behind when the sync aborts after pulling", async () => {
    const database = createTestDatabase()
    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
      throw new Error("[Sync] Concurrent synchronization is not allowed")
    })

    await expect(syncTrip("trip-1", database)).rejects.toThrow(/Concurrent synchronization/)

    expect(await cursorFor(database, "trip-1")).toBeNull()
  })

  it("keeps the previous cursor when a later sync aborts", async () => {
    const database = createTestDatabase()
    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
    })
    mockedApiGet.mockResolvedValueOnce({ changes: {}, timestamp: 1_000 } as never)
    await syncTrip("trip-1", database)

    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
      throw new Error("[Sync] Concurrent synchronization is not allowed")
    })
    mockedApiGet.mockResolvedValueOnce({ changes: {}, timestamp: 5_000 } as never)
    await expect(syncTrip("trip-1", database)).rejects.toThrow()

    // 1_000, not 5_000: the aborted sync's rows never landed, so the next pull
    // must ask for everything since the last sync that did commit.
    expect(await cursorFor(database, "trip-1")).toBe(1_000)
  })

  it("re-requests the delta the aborted sync had claimed", async () => {
    const database = createTestDatabase()
    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
    })
    mockedApiGet.mockResolvedValueOnce({ changes: {}, timestamp: 1_000 } as never)
    await syncTrip("trip-1", database)

    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
      throw new Error("aborted")
    })
    mockedApiGet.mockResolvedValueOnce({ changes: {}, timestamp: 5_000 } as never)
    await expect(syncTrip("trip-1", database)).rejects.toThrow()

    mockedSynchronize.mockImplementation(async ({ pullChanges }) => {
      await pullChanges({ lastPulledAt: null, schemaVersion: 1, migration: null })
    })
    mockedApiGet.mockResolvedValueOnce({ changes: {}, timestamp: 7_000 } as never)
    await syncTrip("trip-1", database)

    expect(mockedApiGet.mock.calls.at(-1)?.[0]).toContain("lastPulledAt=1000")
  })
})
