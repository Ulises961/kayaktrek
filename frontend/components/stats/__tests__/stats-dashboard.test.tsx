import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatsDashboard } from "../stats-dashboard"
import type { Stats } from "@/lib/dtos/public-profile"
import { DISTANCE_UNIT, toNm } from "@/lib/itinerary/distance"

const STATS: Stats = {
  totalDistance: 142.53,
  totalHours: 38,
  logCount: 9,
  tripCount: 11,
  endorsementsReceived: 7,
  // Counts chosen to not collide with any headline metric value.
  conditionsDistribution: { "2": 40, "3": 33, "5": 21 },
  activityByMonth: [
    { month: "2026-05", distance: 60, hours: 12, count: 3 },
    { month: "2026-06", distance: 82.5, hours: 26, count: 6 },
  ],
}

const EMPTY: Stats = {
  totalDistance: 0,
  totalHours: 0,
  logCount: 0,
  tripCount: 0,
  endorsementsReceived: 0,
  conditionsDistribution: {},
  activityByMonth: [],
}

describe("StatsDashboard", () => {
  it("renders headline metrics, rounding distance to 1dp", () => {
    render(<StatsDashboard stats={STATS} />)
    expect(screen.getByText("142.5 km")).toBeDefined()
    expect(screen.getByText("38")).toBeDefined()
    expect(screen.getByText("9")).toBeDefined()
    expect(screen.getByText("11")).toBeDefined()
    expect(screen.getByText("7")).toBeDefined()
  })

  it("renders the sea-conditions and activity sections", () => {
    render(<StatsDashboard stats={STATS} />)
    expect(screen.getByText(/sea conditions/i)).toBeDefined()
    expect(screen.getByText(/distance by month/i)).toBeDefined()
  })

  it("shows an empty state when nothing is logged", () => {
    render(<StatsDashboard stats={EMPTY} />)
    expect(screen.getByText(/no paddling logged yet/i)).toBeDefined()
    expect(screen.queryByText(/sea conditions/i)).toBeNull()
  })

  it("converts total distance to nm when unit is nm", () => {
    render(<StatsDashboard stats={STATS} unit={DISTANCE_UNIT.NM} />)
    const expected = `${Number(toNm(STATS.totalDistance).toFixed(1))} nm`
    expect(screen.getByText(expected)).toBeDefined()
  })
})
