import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
      />,
    )
    expect(screen.getByText(/day 2/i)).toBeInTheDocument()
  })

  it("renders the labelDate as a formatted 'd MMM yyyy' picker value", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />,
    )
    expect(screen.getByText("2 Jun 2026")).toBeInTheDocument()
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
      />,
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
      />,
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
      />,
    )
    // 10 nm × 1.852 = 18.5 km
    expect(screen.getByText(/18\.5/)).toBeInTheDocument()
  })

  it("shows an 'Add date' placeholder when labelDate is null", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={0}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate={null}
        onBoundaryMove={vi.fn()}
      />,
    )
    expect(screen.getByText("Add date")).toBeInTheDocument()
  })
})

describe("BoundaryDivider — date editing", () => {
  it("calls onDateChange with an ISO date when a day is picked from the calendar", async () => {
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
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /2 Jun 2026/i }))
    await userEvent.click(screen.getByText("15"))
    expect(onDateChange).toHaveBeenCalledWith("2026-06-15")
  })
})

describe("BoundaryDivider — drag handle (interactive, default)", () => {
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
      />,
    )
    expect(screen.getByTestId("boundary-drag-handle")).toBeInTheDocument()
  })
})

describe("BoundaryDivider — delete button (interactive mode)", () => {
  it("renders a delete button when onDelete is provided", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onDelete={vi.fn()}
        onBoundaryMove={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /delete day 2/i })).toBeInTheDocument()
  })

  it("calls onDelete when delete button is clicked", async () => {
    const onDelete = vi.fn()
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onDelete={onDelete}
        onBoundaryMove={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("does not render a delete button when onDelete is not provided", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onBoundaryMove={vi.fn()}
      />,
    )
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("does not render a delete button in non-interactive mode even if onDelete is provided", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        interactive={false}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })
})

describe("BoundaryDivider — two-line layout (interactive mode)", () => {
  it("keeps the grip, day label, and delete button together on the first line", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onDelete={vi.fn()}
        onBoundaryMove={vi.fn()}
      />,
    )
    const line1 = screen.getByTestId("boundary-divider-line-1")
    expect(line1).toContainElement(screen.getByTestId("boundary-grip"))
    expect(line1).toContainElement(screen.getByRole("button", { name: /delete day 2/i }))
  })

  it("puts the date picker and distance label on the second line", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        onDateChange={vi.fn()}
        onBoundaryMove={vi.fn()}
      />,
    )
    const line2 = screen.getByTestId("boundary-divider-line-2")
    expect(line2).toContainElement(screen.getByRole("button", { name: /2 Jun 2026/i }))
    expect(line2).toContainElement(screen.getByText(/8\.4/))
  })
})

describe("BoundaryDivider — non-interactive (view mode)", () => {
  it("does not render a drag handle", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        interactive={false}
      />,
    )
    expect(screen.queryByTestId("boundary-drag-handle")).not.toBeInTheDocument()
  })

  it("renders date as formatted text, not a picker button", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        interactive={false}
      />,
    )
    expect(document.querySelector("input")).not.toBeInTheDocument()
    expect(screen.getByText("2 Jun 2026")).toBeInTheDocument()
  })

  it("renders '—' when labelDate is null", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate={null}
        interactive={false}
      />,
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("still renders the day label and distance", () => {
    render(
      <BoundaryDivider
        boundary={BOUNDARY}
        totalDistanceNm={8.4}
        distanceUnit="nm"
        avgSpeedKnots={2.5}
        labelDayNumber={2}
        labelDate="2026-06-02"
        interactive={false}
      />,
    )
    expect(screen.getByText(/day 2/i)).toBeInTheDocument()
    expect(screen.getByText(/8\.4/)).toBeInTheDocument()
  })
})
