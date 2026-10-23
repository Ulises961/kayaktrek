import { describe, it, expect } from "vitest"
import {
  canShareSatellitePosition,
  inReachIsPositionSource,
  satelliteTrackingIsOff,
} from "../satellite"
import { SATELLITE_PROVIDER, type SatelliteFeed } from "@/lib/dtos/satellite-feed"
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

describe("inReachIsPositionSource", () => {
  const ON = { ...MEMBER, sharesSatellitePosition: true }

  function feed(overrides: Partial<SatelliteFeed> = {}): SatelliteFeed {
    return {
      id: "01952f1a-0000-7000-8000-000000000030",
      provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
      feedUrl: "https://share.garmin.com/ada",
      hasPassword: false,
      needsReauth: false,
      ...overrides,
    }
  }

  it("is true for a member aboard with the switch on and a feed that is being polled", () => {
    expect(inReachIsPositionSource(ON, [feed()])).toBe(true)
  })

  it("is false with the switch off, or while the field is absent", () => {
    expect(inReachIsPositionSource({ ...MEMBER, sharesSatellitePosition: false }, [feed()])).toBe(
      false,
    )
    expect(inReachIsPositionSource(MEMBER, [feed()])).toBe(false)
  })

  it("is false with no feed registered: the switch is left on but nothing is being polled", () => {
    expect(inReachIsPositionSource(ON, [])).toBe(false)
  })

  it("is false when the only feed needs its password again: the poll skips it", () => {
    expect(inReachIsPositionSource(ON, [feed({ needsReauth: true })])).toBe(false)
  })

  it("is true when any one feed is being polled", () => {
    expect(inReachIsPositionSource(ON, [feed({ needsReauth: true }), feed()])).toBe(true)
  })

  it("is false for someone who is not a member, and for a member who has left", () => {
    expect(inReachIsPositionSource(undefined, [feed()])).toBe(false)
    expect(inReachIsPositionSource({ ...ON, leftAt: "2026-10-02T09:30:00" }, [feed()])).toBe(false)
  })
})
