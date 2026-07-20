import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MileageSummary } from "../mileage-summary"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

describe("MileageSummary", () => {
  it("shows placeholder when both values are null", () => {
    render(<MileageSummary planned={null} actual={null} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText(/no distance/i)).toBeTruthy()
  })

  it("renders planned distance in the given unit", () => {
    render(<MileageSummary planned={100} actual={null} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText("100.0 km")).toBeTruthy()
  })

  it("renders actual distance when provided", () => {
    render(<MileageSummary planned={100} actual={85} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText("85.0 km")).toBeTruthy()
  })

  it("converts km-stored distance to nm when unit is nm", () => {
    render(<MileageSummary planned={100} actual={null} unit={DISTANCE_UNIT.NM} />)
    expect(screen.getByText("54.0 nm")).toBeTruthy()
  })
})
