import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { getSession } from "../../auth/session"
import { modelClasses } from "../models"
import { appDatabaseSchema } from "../schema"
import { isTripLeader } from "../trip-role"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../../auth/session", () => ({ getSession: jest.fn() }))

const mockGetSession = getSession as jest.Mock

function createTestDatabase() {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

async function withMember(database: Database, userId: string, role: string) {
  await database.write(async () => {
    await database.collections.get("trip_members").create((record) => {
      Object.assign(record._raw, {
        trip_id: "trip-1",
        user_id: userId,
        role,
        nominated_successor: false,
      })
    })
  })
}

beforeEach(() => {
  mockGetSession.mockResolvedValue({ userId: "user-1", email: "ana@example.com" })
})

// Route editing and trip changes are leader-only on the server; the phone has to
// know it offline too, from the crew rows it already syncs.
describe("isTripLeader", () => {
  it("is true for the trip's leader", async () => {
    const database = createTestDatabase()
    await withMember(database, "user-1", "leader")

    expect(await isTripLeader("trip-1", database)).toBe(true)
  })

  it("is false for crew", async () => {
    const database = createTestDatabase()
    await withMember(database, "user-1", "crew")

    expect(await isTripLeader("trip-1", database)).toBe(false)
  })

  it("is false when the crew has never been synced to this phone", async () => {
    expect(await isTripLeader("trip-1", createTestDatabase())).toBe(false)
  })

  it("is false when nobody is signed in", async () => {
    const database = createTestDatabase()
    await withMember(database, "user-1", "leader")
    mockGetSession.mockResolvedValue(null)

    expect(await isTripLeader("trip-1", database)).toBe(false)
  })
})
