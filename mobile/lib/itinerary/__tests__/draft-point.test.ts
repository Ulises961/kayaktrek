import type { LocatedRoutePoint } from "../day-route"
import { distanceToPredecessorNm } from "../draft-point"

function point(id: string, lat: number, lng: number): LocatedRoutePoint {
  return { id, latitude: lat, longitude: lng, type: "stop", dayNumber: 1 }
}

describe("distanceToPredecessorNm", () => {
  it("returns the distance from the named predecessor to the draft position", () => {
    const routePoints = [point("a", 0, 0), point("b", 0, 1)]

    const distance = distanceToPredecessorNm(routePoints, "a", 0, 0.1)

    expect(distance).toBeCloseTo(6.0, 0)
  })

  it("returns null when there is no predecessor to measure from", () => {
    const routePoints = [point("a", 0, 0)]

    expect(distanceToPredecessorNm(routePoints, null, 0, 0.1)).toBeNull()
  })

  it("returns null when the predecessor id isn't in the route", () => {
    const routePoints = [point("a", 0, 0)]

    expect(distanceToPredecessorNm(routePoints, "missing", 0, 0.1)).toBeNull()
  })
})
