import { TRIP_STATE } from "@shared/dtos/trip"

import type { TripCardData } from "@mobile/lib/db/trip-list-cache"

import { groupTrips } from "../group-trips"

function trip(overrides: Partial<TripCardData> & { id: string }): TripCardData {
  return {
    destination: "Somewhere",
    state: TRIP_STATE.BUILDING,
    dateFrom: "2026-10-01",
    dateTo: "2026-10-04",
    travellerCount: 0,
    ...overrides,
  }
}

const HAPPENING = trip({ id: "happening", state: TRIP_STATE.HAPPENING, dateFrom: "2026-09-19" })
const SOON = trip({ id: "soon", dateFrom: "2026-10-01" })
const LATER = trip({ id: "later", dateFrom: "2026-11-01" })
const OLD = trip({ id: "old", state: TRIP_STATE.PAST, dateFrom: "2026-05-01" })
const RECENT = trip({ id: "recent", state: TRIP_STATE.PAST, dateFrom: "2026-08-01" })

function ids(trips: TripCardData[]) {
  return trips.map((entry) => entry.id)
}

describe("groupTrips", () => {
  it("puts a happening trip above everything else", () => {
    const groups = groupTrips([OLD, SOON, HAPPENING])

    expect(groups.map((group) => group.state)).toEqual([
      TRIP_STATE.HAPPENING,
      TRIP_STATE.BUILDING,
      TRIP_STATE.PAST,
    ])
  })

  it("drops a group with nothing in it", () => {
    // A paddler with nothing under way should not be shown an empty "On the water".
    const groups = groupTrips([SOON])

    expect(groups.map((group) => group.state)).toEqual([TRIP_STATE.BUILDING])
  })

  it("orders planned trips by soonest departure", () => {
    const [planned] = groupTrips([LATER, SOON])

    expect(ids(planned.trips)).toEqual(["soon", "later"])
  })

  it("orders past trips most recent first", () => {
    const [past] = groupTrips([OLD, RECENT])

    expect(ids(past.trips)).toEqual(["recent", "old"])
  })

  it("handles several happening trips rather than assuming exactly one", () => {
    const second = trip({ id: "happening-2", state: TRIP_STATE.HAPPENING, dateFrom: "2026-09-20" })
    const [live] = groupTrips([second, HAPPENING])

    expect(ids(live.trips)).toEqual(["happening", "happening-2"])
  })

  it("keeps a trip whose state the backend left null, with the planned ones", () => {
    // `state` is nullish on the DTO, and silently dropping a trip on the app's front
    // door is the worst available outcome. `building` is the state a trip is created in.
    const [planned] = groupTrips([trip({ id: "stateless", state: null })])

    expect(ids(planned.trips)).toEqual(["stateless"])
    expect(planned.state).toBe(TRIP_STATE.BUILDING)
  })

  it("keeps a trip with no departure date rather than sorting it away", () => {
    const undated = trip({ id: "undated", dateFrom: null })
    const [planned] = groupTrips([SOON, undated])

    expect(ids(planned.trips)).toContain("undated")
    expect(planned.trips).toHaveLength(2)
  })

  it("does not mutate the array it was given", () => {
    const input = [LATER, SOON]
    groupTrips(input)

    expect(ids(input)).toEqual(["later", "soon"])
  })

  it("returns nothing for an empty list", () => {
    expect(groupTrips([])).toEqual([])
  })
})
