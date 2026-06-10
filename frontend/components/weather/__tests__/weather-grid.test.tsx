import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { WeatherGrid } from "../weather-grid"
import type { WeatherState } from "@/lib/dtos/weather"

const DAY_ID = "01900000-0000-7000-8000-000000000001"

const states: WeatherState[] = [
  { dayId: DAY_ID, time: "09:00:00", temperature: 14.6, precipitation: 0, windDirection: 247, windForce: 12, cloud: null },
  { dayId: DAY_ID, time: "12:00:00", temperature: 18.2, precipitation: 1.5, windDirection: 90, windForce: 6, cloud: null },
]

describe("WeatherGrid", () => {
  it("renders a column per hour with trimmed times and rounded temperatures", () => {
    render(<WeatherGrid states={states} onRefresh={vi.fn()} isRefreshing={false} />)
    expect(screen.getByText("09:00")).toBeInTheDocument()
    expect(screen.getByText("12:00")).toBeInTheDocument()
    expect(screen.getByText("15°")).toBeInTheDocument() // 14.6 rounded
    expect(screen.getByText("18°")).toBeInTheDocument()
  })

  it("shows precipitation only when above zero", () => {
    render(<WeatherGrid states={states} onRefresh={vi.fn()} isRefreshing={false} />)
    expect(screen.getByText("1.5")).toBeInTheDocument()
  })

  it("invokes onRefresh when the button is clicked", async () => {
    const onRefresh = vi.fn()
    render(<WeatherGrid states={states} onRefresh={onRefresh} isRefreshing={false} />)
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it("disables the button and shows a spinner label while refreshing", () => {
    render(<WeatherGrid states={[]} onRefresh={vi.fn()} isRefreshing />)
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled()
  })
})
