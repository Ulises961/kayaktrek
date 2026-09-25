import { MUTATION_STATUS, type QueuedMutation } from "../../db/mutation-queue"
import { applyPendingFloatPlan } from "../pending-float-plan"

function queued(memberId: string, payload: Record<string, unknown>): QueuedMutation {
  return {
    mutationId: `m-${memberId}-${Object.keys(payload).join()}`,
    entityType: "trip_member",
    operation: "update",
    entityId: memberId,
    payload: { tripId: "trip-1", ...payload },
    deviceTimestamp: "2026-10-02T09:30:00.000Z",
    status: MUTATION_STATUS.PENDING,
    reason: null,
  }
}

const CREW = [
  { id: "m1", vesselMake: "Valley", emergencyContactName: "Jane" },
  { id: "m2", vesselMake: "P&H", emergencyContactName: null },
]

// M9d WP7: own float-plan details edited offline show on the float plan at once.
describe("applyPendingFloatPlan", () => {
  it("leaves the crew as synced with nothing queued", () => {
    expect(applyPendingFloatPlan("trip-1", CREW, [])).toEqual(
      CREW.map((member) => ({ ...member, floatPlanUnsent: false })),
    )
  })

  it("lays a queued edit over the member's own row, in order", () => {
    const changes = [
      queued("m1", { vesselMake: "Prijon" }),
      queued("m1", { emergencyContactName: "Marta" }),
    ]

    const [first, second] = applyPendingFloatPlan("trip-1", CREW, changes)

    expect(first).toMatchObject({
      vesselMake: "Prijon",
      emergencyContactName: "Marta",
      floatPlanUnsent: true,
    })
    expect(second).toMatchObject({ vesselMake: "P&H", floatPlanUnsent: false })
  })

  it("never copies the trip id onto the member", () => {
    const [first] = applyPendingFloatPlan("trip-1", CREW, [queued("m1", { vesselMake: "Prijon" })])

    expect(first).not.toHaveProperty("tripId")
  })

  it("ignores another trip's edits", () => {
    const other = { ...queued("m1", { vesselMake: "Prijon" }), payload: { tripId: "trip-2", vesselMake: "Prijon" } }

    expect(applyPendingFloatPlan("trip-1", CREW, [other])[0].vesselMake).toBe("Valley")
  })
})
