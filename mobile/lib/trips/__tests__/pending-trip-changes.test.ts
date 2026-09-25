import { TRIP_STATE } from "@shared/dtos/trip"

import { MUTATION_STATUS, type QueuedMutation } from "../../db/mutation-queue"
import { applyPendingTripChanges, nextDay } from "../pending-trip-changes"

function queued(payload: Record<string, unknown>, entityId = "trip-1"): QueuedMutation {
  return {
    mutationId: `m-${Math.random()}`,
    entityType: "trip",
    operation: "update",
    entityId,
    payload,
    deviceTimestamp: "2026-10-02T09:00:00.000Z",
    status: MUTATION_STATUS.PENDING,
    reason: null,
  }
}

const UNDER_WAY = { state: TRIP_STATE.HAPPENING, isPaused: false, dateTo: "2026-10-05" }

// A trip change made offline is shown as done on this phone straight away — the
// leader needs to see the trip as they left it — while it waits to be sent.
describe("applyPendingTripChanges", () => {
  it("leaves the trip as it was with nothing queued", () => {
    expect(applyPendingTripChanges("trip-1", UNDER_WAY, [])).toEqual(UNDER_WAY)
  })

  it("shows a queued pause", () => {
    expect(applyPendingTripChanges("trip-1", UNDER_WAY, [queued({ action: "pause" })])).toMatchObject({
      isPaused: true,
    })
  })

  it("applies queued changes in order", () => {
    const changes = [queued({ action: "pause" }), queued({ action: "resume" })]

    expect(applyPendingTripChanges("trip-1", UNDER_WAY, changes)).toMatchObject({ isPaused: false })
  })

  it("shows an abort or a finish as the trip being over", () => {
    const paused = { ...UNDER_WAY, isPaused: true }

    expect(applyPendingTripChanges("trip-1", paused, [queued({ action: "abort" })]).state).toBe(TRIP_STATE.PAST)
    expect(applyPendingTripChanges("trip-1", UNDER_WAY, [queued({ action: "finish" })]).state).toBe(TRIP_STATE.PAST)
  })

  it("shows a queued new end date", () => {
    expect(applyPendingTripChanges("trip-1", UNDER_WAY, [queued({ dateTo: "2026-10-06" })]).dateTo).toBe("2026-10-06")
  })

  it("ignores another trip's changes", () => {
    expect(applyPendingTripChanges("trip-1", UNDER_WAY, [queued({ action: "pause" }, "trip-2")])).toEqual(UNDER_WAY)
  })
})

describe("nextDay", () => {
  it("is the calendar day after, across a month end", () => {
    expect(nextDay("2026-10-31")).toBe("2026-11-01")
  })
})
