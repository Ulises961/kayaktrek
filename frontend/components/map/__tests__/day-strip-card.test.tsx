import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DayStripCard } from "../day-strip-card"

const BASE = {
  dayNumber: 1,
  date: "2026-06-15",
  distanceNm: 8.4,
  avgSpeedKnots: 2.5,
  distanceUnit: "nm" as const,
  isSelected: false,
  isToday: false,
  isPastDay: false,
  onClick: vi.fn(),
}

describe("DayStripCard — content", () => {
  it("renders the day number", () => {
    render(<DayStripCard {...BASE} />)
    expect(screen.getByText("Day 1")).toBeInTheDocument()
  })

  it("renders the date", () => {
    render(<DayStripCard {...BASE} />)
    expect(screen.getByText("Jun 15")).toBeInTheDocument()
  })

  it("shows 'No date' when date is null", () => {
    render(<DayStripCard {...BASE} date={null} />)
    expect(screen.getByText("No date")).toBeInTheDocument()
  })

  it("renders the formatted distance in nm", () => {
    render(<DayStripCard {...BASE} distanceNm={8.4} distanceUnit="nm" />)
    expect(screen.getByText(/8\.4 nm/)).toBeInTheDocument()
  })

  it("renders the formatted distance in km", () => {
    render(<DayStripCard {...BASE} distanceNm={8.4} distanceUnit="km" />)
    // 8.4 nm × 1.852 = 15.6 km
    expect(screen.getByText(/15\.6 km/)).toBeInTheDocument()
  })

  it("renders estimated paddling time", () => {
    // 8.4 nm / 2.5 kn = 3.36 h = 3h 22min
    render(<DayStripCard {...BASE} distanceNm={8.4} avgSpeedKnots={2.5} />)
    expect(screen.getByText(/3h 22min/)).toBeInTheDocument()
  })

  it("renders weather stub chip", () => {
    render(<DayStripCard {...BASE} />)
    expect(screen.getByText("No data")).toBeInTheDocument()
  })
})

describe("DayStripCard — selection and states", () => {
  it("has data-selected when isSelected", () => {
    render(<DayStripCard {...BASE} isSelected={true} />)
    expect(screen.getByRole("button")).toHaveAttribute("data-selected", "true")
  })

  it("does not have data-selected when not selected", () => {
    render(<DayStripCard {...BASE} isSelected={false} />)
    expect(screen.getByRole("button")).not.toHaveAttribute("data-selected")
  })

  it("has data-today when isToday", () => {
    render(<DayStripCard {...BASE} isToday={true} />)
    expect(screen.getByRole("button")).toHaveAttribute("data-today", "true")
  })

  it("has data-past when isPastDay", () => {
    render(<DayStripCard {...BASE} isPastDay={true} />)
    expect(screen.getByRole("button")).toHaveAttribute("data-past", "true")
  })

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn()
    render(<DayStripCard {...BASE} onClick={onClick} />)
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
