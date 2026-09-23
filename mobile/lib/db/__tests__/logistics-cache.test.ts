import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { CACHE_KEY, readCachedAt } from "../cache-freshness"
import { loadLogisticsCache, saveLogisticsCache } from "../logistics-cache"
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

const PERMIT = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01",
  ownerId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a09",
  type: "permit" as const,
  name: "National park permit",
  date: "2026-10-01",
  confirmationNumber: "NP-42",
}
const HOSTEL = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02",
  type: "accommodation" as const,
  name: "Hostel booking",
}
const VAN = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03",
  arrangedById: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a08",
  driverName: "Lea",
  seatsAvailable: 4,
  kayakSpots: 2,
  pickupPoint: "Harbour car park",
  passengers: [{ id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a07", tripMemberId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a08" }],
}

// Travel documents and shuttle vehicles had no cache at all — Logistics was
// the one trip screen with nothing to show offline. Stored whole, per row, so
// a vehicle's passengers and a document's dates come back exactly as sent.
describe("logistics cache", () => {
  it("saves and reads back a trip's documents and vehicles, in order", async () => {
    const database = createTestDatabase()

    await saveLogisticsCache("trip-1", { documents: [PERMIT, HOSTEL], vehicles: [VAN] }, database)

    const cached = await loadLogisticsCache("trip-1", database)
    expect(cached.documents.map((doc) => doc.name)).toEqual(["National park permit", "Hostel booking"])
    expect(cached.documents[0]).toMatchObject({ date: "2026-10-01", confirmationNumber: "NP-42" })
    expect(cached.vehicles).toHaveLength(1)
    expect(cached.vehicles[0]).toMatchObject({ driverName: "Lea", pickupPoint: "Harbour car park" })
    expect(cached.vehicles[0].passengers).toHaveLength(1)
  })

  it("wholesale-replaces only the saved trip's rows", async () => {
    const database = createTestDatabase()
    await saveLogisticsCache("trip-1", { documents: [PERMIT], vehicles: [VAN] }, database)
    await saveLogisticsCache("trip-2", { documents: [HOSTEL], vehicles: [] }, database)

    await saveLogisticsCache("trip-1", { documents: [], vehicles: [] }, database)

    expect(await loadLogisticsCache("trip-1", database)).toEqual({ documents: [], vehicles: [] })
    expect((await loadLogisticsCache("trip-2", database)).documents.map((doc) => doc.name)).toEqual([
      "Hostel booking",
    ])
  })

  it("records when the trip's logistics were cached", async () => {
    const database = createTestDatabase()

    await saveLogisticsCache("trip-1", { documents: [PERMIT], vehicles: [] }, database)

    expect(await readCachedAt(CACHE_KEY.tripLogistics("trip-1"), database)).not.toBeNull()
  })

  it("reads nothing for a trip that was never cached", async () => {
    const database = createTestDatabase()

    expect(await loadLogisticsCache("never", database)).toEqual({ documents: [], vehicles: [] })
  })
})
