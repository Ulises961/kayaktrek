import { describe, it, expect } from "vitest"
import { seasonOfDetail } from "../season"
import type { PublicItineraryDetail } from "@/lib/dtos/itinerary"

function detail(days: PublicItineraryDetail["days"]): PublicItineraryDetail {
  return { id: "x", name: "n", days }
}

describe("seasonOfDetail", () => {
  it("returns null when no day has a date", () => {
    expect(
      seasonOfDetail(detail([{ dayNumber: 1, points: [{ latitude: 40, longitude: 5 }] }])),
    ).toBeNull()
  })

  it("derives northern-hemisphere summer from a July date", () => {
    expect(
      seasonOfDetail(
        detail([{ dayNumber: 1, date: "2024-07-15", points: [{ latitude: 43, longitude: 8 }] }]),
      ),
    ).toBe("summer")
  })

  it("inverts for the southern hemisphere", () => {
    expect(
      seasonOfDetail(
        detail([
          { dayNumber: 1, date: "2024-12-20", points: [{ latitude: -33.8, longitude: 151.2 }] },
        ]),
      ),
    ).toBe("summer")
  })

  it("ignores the staging day 0 and uses the earliest dated numbered day", () => {
    expect(
      seasonOfDetail(
        detail([
          { dayNumber: 0, date: "2024-01-01", points: [] },
          { dayNumber: 1, date: "2024-07-10", points: [{ latitude: 43, longitude: 8 }] },
        ]),
      ),
    ).toBe("summer")
  })
})
