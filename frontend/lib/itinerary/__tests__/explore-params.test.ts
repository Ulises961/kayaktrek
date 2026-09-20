import { describe, it, expect } from "vitest"

import { exploreQueryString } from "../explore-params"

describe("exploreQueryString", () => {
  it("is empty when nothing is filtered", () => {
    expect(exploreQueryString({})).toBe("")
  })

  it("trims a name and drops it when it is only whitespace", () => {
    expect(exploreQueryString({ name: "  skye  " })).toBe("name=skye")
    expect(exploreQueryString({ name: "   " })).toBe("")
  })

  it("repeats the season key once per season", () => {
    expect(exploreQueryString({ seasons: ["spring", "summer"] })).toBe(
      "season=spring&season=summer",
    )
  })

  it("keeps a zero bound rather than treating it as absent", () => {
    // A truthiness check would drop 0, which is a real lower bound — the one meaning
    // "no minimum, include the shortest routes".
    expect(exploreQueryString({ minMiles: 0 })).toBe("minMiles=0")
    expect(exploreQueryString({ minDays: 0 })).toBe("minDays=0")
  })

  it("sends a bbox all-or-nothing, as four keys", () => {
    expect(exploreQueryString({ bbox: { minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 } })).toBe(
      "minLat=1&minLng=2&maxLat=3&maxLng=4",
    )
  })

  it("sends per_page in the snake_case the API expects, not perPage", () => {
    expect(exploreQueryString({ page: 2, perPage: 20 })).toBe("page=2&per_page=20")
  })

  it("percent-encodes values so a name with spaces or an ampersand cannot break the query", () => {
    expect(exploreQueryString({ name: "loch ness & back" })).toBe("name=loch%20ness%20%26%20back")
  })
})
