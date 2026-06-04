import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BoundaryDivider } from "../boundary-divider"
import type { DaySlice } from "@/lib/itinerary/boundaries"

const BOUNDARY: DaySlice = {
  dayId: "day-1",
  dayNumber: 1,
  startIdx: 0,
  endIdx: 2,
  date: "2026-06-01",
}

describe("BoundaryDivider — display", () => {
  it("renders the labelDayNumber", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByText(/day 2/i)).toBeInTheDocument()
  })

  it("renders the labelDate as an input with the correct value", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue("2026-06-02")).toBeInTheDocument()
  })

  it("renders a distance label", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
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
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
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
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />
    )
    // 10 nm × 1.852 = 18.5 km
    expect(screen.getByText(/18\.5/)).toBeInTheDocument()
  })

  it("renders an empty date input when labelDate is null", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={0}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate={null}
        onBoundaryMove={vi.fn()}
      />
    )
    const input = document.querySelector<HTMLInputElement>("input[type=date]")
    expect(input).toBeInTheDocument()
    expect(input?.value).toBe("")
  })
})

describe("BoundaryDivider — date editing", () => {
  it("calls onDateChange with the new value when the date input changes", () => {
    const onDateChange = vi.fn()
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate={null}
        onDateChange={onDateChange}
        onBoundaryMove={vi.fn()}
      />
    )
    const input = document.querySelector<HTMLInputElement>("input[type=date]")!
    fireEvent.change(input, { target: { value: "2026-07-01" } })
    expect(onDateChange).toHaveBeenCalledWith("2026-07-01")
  })

  it("calls onDateChange with null when the date is cleared", () => {
    const onDateChange = vi.fn()
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onDateChange={onDateChange}
        onBoundaryMove={vi.fn()}
      />
    )
    const input = document.querySelector<HTMLInputElement>("input[type=date]")!
    fireEvent.change(input, { target: { value: "" } })
    expect(onDateChange).toHaveBeenCalledWith(null)
  })
})

describe("BoundaryDivider — drag handle", () => {
  it("renders a drag-handle element", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />
    )
    expect(screen.getByTestId("boundary-drag-handle")).toBeInTheDocument()
  })
})
