import { describe, it, expect } from "vitest"
import { canShareSatellitePosition, satelliteTrackingIsOff } from "../satellite"
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

describe("satelliteTrackingIsOff", () => {
  const OFF = { ...MEMBER, sharesSatellitePosition: false }
  const ON = { ...MEMBER, sharesSatellitePosition: true }

  it("is true for a member of a happening trip who has a feed and the switch off", () => {
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, OFF, true)).toBe(true)
    // The field is absent until the member switches it on once.
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, MEMBER, true)).toBe(true)
  })

  it("is false when the switch is on", () => {
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, ON, true)).toBe(false)
  })

  it("is false without a registered feed: a paddler with no inReach is not warned", () => {
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, OFF, false)).toBe(false)
  })

  it("is false before the trip starts, when nothing is yet expected to be sharing", () => {
    expect(satelliteTrackingIsOff(TRIP_STATE.BUILDING, OFF, true)).toBe(false)
  })

  it("is false once the trip is over, for a non-member, and for a member who has left", () => {
    expect(satelliteTrackingIsOff(TRIP_STATE.PAST, OFF, true)).toBe(false)
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, undefined, true)).toBe(false)
    const departed = { ...OFF, leftAt: "2026-10-02T09:30:00" }
    expect(satelliteTrackingIsOff(TRIP_STATE.HAPPENING, departed, true)).toBe(false)
  })
})
