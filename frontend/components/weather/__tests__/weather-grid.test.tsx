import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { WeatherGrid } from "../weather-grid"
import type { WeatherState } from "@/lib/dtos/weather"

const DAY_ID = "01900000-0000-7000-8000-000000000001"

const states: WeatherState[] = [
  {
    dayId: DAY_ID,
    time: "09:00:00",
    temperature: 14.6,
    precipitation: 0,
    windDirection: 247,
    windForce: 12,
    cloud: "10",
  },
  {
    dayId: DAY_ID,
    time: "12:00:00",
    temperature: 18.2,
    precipitation: 1.5,
    windDirection: 90,
    windForce: 6,
    cloud: "70",
  },
]

describe("WeatherGrid", () => {
  it("renders nothing when there are no states", () => {
    render(<WeatherGrid states={[]} />)
    expect(screen.getByText("No weather data.")).toBeInTheDocument()
  })

  it("renders a column per hour with trimmed times and rounded temperatures", () => {
    render(<WeatherGrid states={states} />)
    expect(screen.getByText("09:00")).toBeInTheDocument()
    expect(screen.getByText("12:00")).toBeInTheDocument()
    expect(screen.getByText("15°")).toBeInTheDocument() // 14.6 rounded
    expect(screen.getByText("18°")).toBeInTheDocument()
  })

  it("shows precipitation only when above zero", () => {
    render(<WeatherGrid states={states} />)
    expect(screen.getByText("1.5")).toBeInTheDocument()
  })

  it("shows cloud icon based on cloud cover", () => {
    render(<WeatherGrid states={states} />)
    // 10% → Sun aria-label, 70% → Cloud aria-label
    expect(screen.getByLabelText("10% cloud")).toBeInTheDocument()
    expect(screen.getByLabelText("70% cloud")).toBeInTheDocument()
  })
})
