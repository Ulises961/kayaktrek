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

  it("shows a gap month as a dash rather than closing the axis up", () => {
    // stats_for_user emits only months that have logs, so April/June arrive
    // adjacent — drawn as-is, the skipped month reads as though it never was.
    render(
      <StatsDashboard
        stats={{
          ...STATS,
          activityByMonth: [
            { month: "2026-04", distance: 18, hours: 4, count: 1 },
            { month: "2026-06", distance: 30, hours: 6, count: 2 },
          ],
        }}
      />,
    )

    expect(screen.getByText("May 26")).toBeDefined()
    expect(screen.getByText("no logs")).toBeDefined()
    // An em dash, not "0 km" — nothing recorded is not the same as zero paddled.
    expect(screen.getByText("—")).toBeDefined()
  })

  it("prints each month's distance rather than hiding it in a tooltip", () => {
    // `title` never fires on touch, so the old vertical bars carried no numbers
    // at all on a phone — worst on the public profile, where the reader has no
    // logs to fall back on.
    render(
      <StatsDashboard
        stats={{
          ...STATS,
          activityByMonth: [
            { month: "2026-05", distance: 12, hours: 3, count: 1 },
            { month: "2026-06", distance: 2678, hours: 40, count: 4 },
          ],
        }}
      />,
    )

    expect(screen.getByText("12 km")).toBeDefined()
    expect(screen.getByText("2678 km")).toBeDefined()
    expect(screen.getByText("1 log")).toBeDefined()
    expect(screen.getByText("4 logs")).toBeDefined()
  })

  it("keeps a small month's bar visible next to an outlier", () => {
    // The old floor was 4% of the tallest bar, so against a 2678 km month every
    // other month collapsed to the same nub — a flat distribution it never had.
    const { container } = render(
      <StatsDashboard
        stats={{
          ...STATS,
          conditionsDistribution: {},
          activityByMonth: [
            { month: "2026-05", distance: 12, hours: 3, count: 1 },
            { month: "2026-06", distance: 2678, hours: 40, count: 4 },
          ],
        }}
      />,
    )
    const widths = Array.from(container.querySelectorAll("li span > span")).map(
      (bar) => (bar as HTMLElement).style.width,
    )

    expect(widths).toEqual(["1.5%", "100%"])
  })

  it("omits the chart for a single month — one bar is not a distribution", () => {
    render(
      <StatsDashboard
        stats={{
          ...STATS,
          activityByMonth: [{ month: "2026-07", distance: 20, hours: 5, count: 2 }],
        }}
      />,
    )

    expect(screen.queryByText(/distance by month/i)).toBeNull()
    // The rest of the dashboard still stands.
    expect(screen.getByText(/sea conditions/i)).toBeDefined()
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
