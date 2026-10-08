import { routeIsOnPhone, type RouteSample } from "../route-source"

const CLEAR: RouteSample = { hasLocalChanges: false, inConflict: false, pushing: false }

// A reload fetches the server's copy, which takes a moment. An edit made just before it, and the
// push that sends the edit, can both finish inside that moment — so "are there unsent edits?"
// asked only at the end finds none and shows the server's older copy: the point snaps back to
// where it was, and an undo appears to do nothing.
describe("routeIsOnPhone", () => {
  it("is false when nothing is unsent, parked or being sent: the server's copy is the current one", () => {
    expect(routeIsOnPhone([CLEAR, CLEAR])).toBe(false)
  })

  it("is false with no samples at all, as for a trip whose route was never pulled", () => {
    expect(routeIsOnPhone([])).toBe(false)
  })

  it("is true while the phone holds edits the server has not seen", () => {
    expect(routeIsOnPhone([{ ...CLEAR, hasLocalChanges: true }])).toBe(true)
  })

  it("is true for a parked conflict, which only the leader's choice can resolve", () => {
    expect(routeIsOnPhone([{ ...CLEAR, inConflict: true }])).toBe(true)
  })

  it("is true while a push is in the air, since the server may not have it yet", () => {
    expect(routeIsOnPhone([{ ...CLEAR, pushing: true }])).toBe(true)
  })

  it("stays true when the edit was unsent at the start but the push finished during the fetch", () => {
    const before: RouteSample = { ...CLEAR, hasLocalChanges: true }
    const after: RouteSample = CLEAR

    expect(routeIsOnPhone([before, after])).toBe(true)
  })

  it("stays true when the push began during the fetch and was still going at the end", () => {
    expect(routeIsOnPhone([CLEAR, { ...CLEAR, pushing: true }])).toBe(true)
  })
})
