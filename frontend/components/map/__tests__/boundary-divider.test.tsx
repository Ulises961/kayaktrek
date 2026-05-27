import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { BoundaryDivider } from "../boundary-divider"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"

const BOUNDARY: DraftBoundary = {
  dayId: "day-1",
  dayNumber: 1,
  endPointIdx: 2,
  date: "2026-06-01",
}

describe("BoundaryDivider — display", () => {
  it("renders the day number", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText(/day 1/i)).toBeInTheDocument()
  })

  it("renders the date when provided", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText("2026-06-01")).toBeInTheDocument()
  })

  it("renders a distance label", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText(/8\.4/)).toBeInTheDocument()
  })

  it("renders the unit in the distance label", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText(/nm/i)).toBeInTheDocument()
  })

  it("converts distance to km when distanceUnit is km", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={10}
        distanceUnit="km"
        onBoundaryMove={vi.fn()}
      />
    )
    // 10 nm × 1.852 = 18.5 km
    expect(screen.getByText(/18\.5/)).toBeInTheDocument()
  })

  it("shows 'No date' when date is null", () => {
    render(
      <BoundaryDivider
        boundary={{ ...BOUNDARY, date: null }}
        totalDistanceNm={0}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText(/no date/i)).toBeInTheDocument()
  })
})

describe("BoundaryDivider — drag handle", () => {
  it("renders a drag-handle element", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByTestId("boundary-drag-handle")).toBeInTheDocument()
  })
})
