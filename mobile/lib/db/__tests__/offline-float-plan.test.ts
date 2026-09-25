import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { modelClasses } from "../models"
import { loadOfflineCrew } from "../offline-float-plan"
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

describe("loadOfflineCrew", () => {
  it("reads the cached crew for a trip, leader first", async () => {
    const database = createTestDatabase()
    const tripMembers = database.collections.get("trip_members")
    await database.write(async () => {
      await database.batch(
        tripMembers.prepareCreateFromDirtyRaw({
          id: "member-crew", trip_id: "trip-1", user_id: "user-2",
          user_name: "Jamie", user_surname: "Doe", user_username: "jamied",
          role: "crew", nominated_successor: false,
          vessel_make: "P&H", vessel_model: null, vessel_length_cm: null,
          vessel_color_primary: null, vessel_color_secondary: null,
          emergency_contact_name: "Alex Doe", emergency_contact_phone: "555-1234",
          emergency_contact_relationship: "Sibling", float_plan_confirmed_at: null,
        }),
        tripMembers.prepareCreateFromDirtyRaw({
          id: "member-leader", trip_id: "trip-1", user_id: "user-1",
          user_name: "Sam", user_surname: "Lee", user_username: "samlee",
          role: "leader", nominated_successor: false,
          vessel_make: "Valley", vessel_model: "Etain", vessel_length_cm: 550,
          vessel_color_primary: "red", vessel_color_secondary: null,
          emergency_contact_name: null, emergency_contact_phone: null,
          emergency_contact_relationship: null, float_plan_confirmed_at: null,
        }),
        // A different trip's member must never leak into this trip's crew.
        tripMembers.prepareCreateFromDirtyRaw({
          id: "member-other-trip", trip_id: "trip-2", user_id: "user-3",
          user_name: "Other", user_surname: null, user_username: "other",
          role: "leader", nominated_successor: false,
          vessel_make: null, vessel_model: null, vessel_length_cm: null,
          vessel_color_primary: null, vessel_color_secondary: null,
          emergency_contact_name: null, emergency_contact_phone: null,
          emergency_contact_relationship: null, float_plan_confirmed_at: null,
        })
      )
    })

    const crew = await loadOfflineCrew("trip-1", database)

    expect(crew.map((member) => member.id)).toEqual(["member-leader", "member-crew"])
    expect(crew[0].role).toBe("leader")
    // The user id lets a screen find the signed-in paddler's own row offline (M9d).
    expect(crew[0].user).toEqual({ id: "user-1", name: "Sam", surname: "Lee", username: "samlee" })
    expect(crew[0].vesselMake).toBe("Valley")
    expect(crew[0].vesselLengthCm).toBe(550)
    expect(crew[1].emergencyContactName).toBe("Alex Doe")
  })

  it("returns an empty crew for a trip that was never synced", async () => {
    const database = createTestDatabase()
    const crew = await loadOfflineCrew("never-synced", database)
    expect(crew).toEqual([])
  })
})
