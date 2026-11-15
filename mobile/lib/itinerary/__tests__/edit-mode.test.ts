import { TRIP_STATE } from "@shared/dtos/trip"

import { canEditRoute } from "../edit-mode"

// Web offers edit mode to the leader while a trip is being built or is under way, and locks it once
// the trip is past. The server refuses the rest; this decides whether the phone offers the button.
describe("canEditRoute", () => {
  it("lets the leader edit a trip that is being built", () => {
    expect(canEditRoute({ isLeader: true, tripState: TRIP_STATE.BUILDING })).toBe(true)
  })

  it("lets the leader edit a trip that is under way", () => {
    expect(canEditRoute({ isLeader: true, tripState: TRIP_STATE.HAPPENING })).toBe(true)
  })

  it("locks a trip that is over", () => {
    expect(canEditRoute({ isLeader: true, tripState: TRIP_STATE.PAST })).toBe(false)
  })

  it("locks an archived trip", () => {
    expect(canEditRoute({ isLeader: true, tripState: TRIP_STATE.ARCHIVED })).toBe(false)
  })

  it("never lets crew edit, whatever the state", () => {
    expect(canEditRoute({ isLeader: false, tripState: TRIP_STATE.BUILDING })).toBe(false)
    expect(canEditRoute({ isLeader: false, tripState: TRIP_STATE.HAPPENING })).toBe(false)
  })

  it("offers nothing when the state is not known on this phone", () => {
    expect(canEditRoute({ isLeader: true, tripState: null })).toBe(false)
  })
})
