import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RouteDayBreakdown } from "../route-day-breakdown"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
import type { DaySummary } from "@/lib/itinerary/public-routes"

const DAYS: DaySummary[] = [
  { dayNumber: 1, date: "2026-07-01", distanceNm: 12.34 },
  { dayNumber: 2, date: null, distanceNm: 8 },
]

describe("RouteDayBreakdown", () => {
  it("renders a row per day with distance in nm by default", () => {
    render(<RouteDayBreakdown days={DAYS} />)
    expect(screen.getByText("Day 1")).toBeInTheDocument()
    expect(screen.getByText("Day 2")).toBeInTheDocument()
    expect(screen.getByText("12.3 nm")).toBeInTheDocument()
    expect(screen.getByText("8.0 nm")).toBeInTheDocument()
  })

  it("converts each day's distance to km when unit is km", () => {
    render(<RouteDayBreakdown days={DAYS} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText(`${formatDistance(12.34, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.getByText(`${formatDistance(8, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.queryByText(/nm/)).not.toBeInTheDocument()
  })

  it("shows a day's date when present and omits it when absent", () => {
    render(<RouteDayBreakdown days={DAYS} />)
    expect(screen.getByText("1 Jul 2026")).toBeInTheDocument()
  })

  it("renders nothing when there are no days", () => {
    const { container } = render(<RouteDayBreakdown days={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
