import { describe, it, expect } from "vitest"
import { canShareSatellitePosition } from "../satellite"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"

const MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000020",
  role: MEMBER_ROLE.CREW,
  user: {
    id: "01952f1a-0000-7000-8000-000000000001",
    mail: "ada@example.com",
    username: "ada",
    name: "Ada",
  },
}

describe("canShareSatellitePosition", () => {
  it.each([TRIP_STATE.BUILDING, TRIP_STATE.HAPPENING])(
    "is offered to a member aboard while the trip is %s",
    (state) => {
      expect(canShareSatellitePosition(state, MEMBER)).toBe(true)
    },
  )

  it("is not offered once the trip is over: nothing is left to receive a position", () => {
    expect(canShareSatellitePosition(TRIP_STATE.PAST, MEMBER)).toBe(false)
  })

  it("is not offered when the trip has no state", () => {
    expect(canShareSatellitePosition(null, MEMBER)).toBe(false)
    expect(canShareSatellitePosition(undefined, MEMBER)).toBe(false)
  })

  it("is not offered to someone who is not a member", () => {
    expect(canShareSatellitePosition(TRIP_STATE.HAPPENING, undefined)).toBe(false)
  })

  it("is not offered to a member who has left: the backend would refuse it", () => {
    const departed = { ...MEMBER, leftAt: "2026-10-02T09:30:00" }
    expect(canShareSatellitePosition(TRIP_STATE.HAPPENING, departed)).toBe(false)
  })
})
