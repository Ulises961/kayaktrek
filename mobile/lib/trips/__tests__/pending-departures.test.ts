import { MUTATION_STATUS, type QueuedMutation } from "../../db/mutation-queue"
import { applyPendingDepartures } from "../pending-departures"

function queued(operation: string, memberId: string, note?: string): QueuedMutation {
  return {
    mutationId: `m-${operation}-${memberId}`,
    entityType: "crew_departure",
    operation,
    entityId: memberId,
    payload: { tripId: "trip-1", ...(note ? { note } : {}) },
    deviceTimestamp: "2026-10-02T09:30:00.000Z",
    status: MUTATION_STATUS.PENDING,
    reason: null,
  }
}

const MEMBERS = [
  { id: "m1", leftAt: null, leftNote: null },
  { id: "m2", leftAt: "2026-10-01T18:00:00.000Z", leftNote: "Earlier" },
]

// A departure recorded on this phone shows at once, marked as not yet sent.
describe("applyPendingDepartures", () => {
  it("leaves the crew as synced with nothing queued", () => {
    expect(applyPendingDepartures("trip-1", MEMBERS, [])).toEqual(
      MEMBERS.map((member) => ({ ...member, departureUnsent: false })),
    )
  })

  it("shows a queued departure with when it was recorded and its note", () => {
    const [first] = applyPendingDepartures("trip-1", MEMBERS, [queued("create", "m1", "Wrist injury")])

    expect(first).toMatchObject({
      leftAt: "2026-10-02T09:30:00.000Z",
      leftNote: "Wrist injury",
      departureUnsent: true,
    })
  })

  it("shows a queued undo as the paddler back on the trip", () => {
    const [, second] = applyPendingDepartures("trip-1", MEMBERS, [queued("delete", "m2")])

    expect(second).toMatchObject({ leftAt: null, leftNote: null, departureUnsent: true })
  })

  it("ignores departures queued for another trip", () => {
    const other = { ...queued("create", "m1"), payload: { tripId: "trip-2" } }

    expect(applyPendingDepartures("trip-1", MEMBERS, [other])[0].leftAt).toBeNull()
  })
})
