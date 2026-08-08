import { describe, it, expect } from "vitest"
import { pickFeatureRoute } from "@/lib/landing/feature-route"
import type { RouteData } from "@/lib/itinerary/public-routes"

function route(
  id: string,
  positions: [number, number][],
  totalMiles: number | null = null,
): RouteData {
  return {
    id,
    name: `Route ${id}`,
    positions,
    days: [],
    boundaryColors: {},
    totalMiles,
    dayCount: 0,
  }
}

const costaBrava: [number, number][] = [
  [41.9, 3.1],
  [41.8, 3.2],
  [41.7, 3.3],
]
const algarve: [number, number][] = [
  [37.1, -8.9],
  [37.0, -8.8],
]

describe("pickFeatureRoute", () => {
  it("returns null when there are no routes", () => {
    expect(pickFeatureRoute([])).toBeNull()
  })

  it("returns the longest route by recorded distance", () => {
    const short = route("a", algarve, 12)
    const long = route("b", costaBrava, 48)
    expect(pickFeatureRoute([short, long])).toBe(long)
    expect(pickFeatureRoute([long, short])).toBe(long)
  })

  it("falls back to waypoint count when distances are missing", () => {
    const sparse = route("a", algarve, null)
    const detailed = route("b", costaBrava, null)
    expect(pickFeatureRoute([sparse, detailed])).toBe(detailed)
  })

  it("ranks a route with a recorded distance above one without", () => {
    const measured = route("a", algarve, 12)
    const unmeasured = route("b", costaBrava, null)
    expect(pickFeatureRoute([measured, unmeasured])).toBe(measured)
  })

  it("skips routes that cannot frame an extent", () => {
    const single = route("a", [[41.9, 3.1]], 99)
    const empty = route("b", [], 99)
    const framable = route("c", algarve, 3)
    expect(pickFeatureRoute([single, empty, framable])).toBe(framable)
  })

  it("returns null when no route has two or more positions", () => {
    expect(pickFeatureRoute([route("a", []), route("b", [[41.9, 3.1]])])).toBeNull()
  })

  it("breaks ties on id so the same data always frames the same way", () => {
    const first = route("aaa", algarve, 20)
    const second = route("bbb", [...algarve], 20)
    expect(pickFeatureRoute([first, second])).toBe(first)
    expect(pickFeatureRoute([second, first])).toBe(first)
  })
})
