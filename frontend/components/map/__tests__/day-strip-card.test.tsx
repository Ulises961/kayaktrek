import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DayStripCard } from "../day-strip-card"

vi.mock("@/lib/weather/actions", () => ({
  fetchDayWeather: vi.fn(),
  fetchDaySea: vi.fn(),
}))

import { fetchDayWeather, fetchDaySea } from "@/lib/weather/actions"

const WEATHER = fetchDayWeather as ReturnType<typeof vi.fn>
const SEA = fetchDaySea as ReturnType<typeof vi.fn>

const DAY_ID = "01900000-0000-7000-8000-000000000001"

const BASE = {
  dayId: DAY_ID,
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

const weatherStateFixture = {
  dayId: DAY_ID,
  time: "12:00",
  temperature: 18,
  precipitation: 0,
  windDirection: 247,
  windForce: 12,
  cloud: "partly_cloudy",
}

const seaStateFixture = {
  dayId: DAY_ID,
  time: "12:00",
  waveHeight: 1.2,
  waveDirection: 270,
  swellDirection: 280,
  swellPeriod: 8,
  currentSpeed: null,
  currentDirection: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  WEATHER.mockResolvedValue({ success: false, error: "Not found" })
  SEA.mockResolvedValue({ success: false, error: "Not found" })
})

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

  it("does not render chip section before data loads", () => {
    WEATHER.mockReturnValue(new Promise(() => {}))
    SEA.mockReturnValue(new Promise(() => {}))
    render(<DayStripCard {...BASE} />)
    expect(screen.queryByTestId("weather-chips")).not.toBeInTheDocument()
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

describe("DayStripCard — weather chips", () => {
  it("renders wind, wave, and tide chips with correct labels", async () => {
    WEATHER.mockResolvedValue({
      success: true,
      data: { dayId: DAY_ID, model: "gfs", weatherStates: [weatherStateFixture] },
    })
    SEA.mockResolvedValue({
      success: true,
      data: {
        dayId: DAY_ID,
        highTide: "09:42",
        seaStates: [seaStateFixture],
      },
    })

    render(<DayStripCard {...BASE} />)

    // 247° → SW, windForce 12 → "SW 12 kn"
    expect(await screen.findByText("SW 12 kn")).toBeInTheDocument()
    expect(screen.getByText("1.2 m")).toBeInTheDocument()
    expect(screen.getByText("HW 09:42")).toBeInTheDocument()
  })

  it("shows — for chips with absent data", async () => {
    WEATHER.mockResolvedValue({
      success: true,
      data: { dayId: DAY_ID, model: null, weatherStates: [] },
    })
    SEA.mockResolvedValue({
      success: true,
      data: { dayId: DAY_ID, highTide: "09:42", seaStates: [] },
    })

    render(<DayStripCard {...BASE} />)

    // tide has data, wind and wave are absent
    expect(await screen.findByText("HW 09:42")).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(2)
  })

  it("does not render chip section when all three are absent", async () => {
    WEATHER.mockResolvedValue({ success: false, error: "Not found" })
    SEA.mockResolvedValue({ success: false, error: "Not found" })

    render(<DayStripCard {...BASE} />)

    await waitFor(() => {
      expect(WEATHER).toHaveBeenCalledWith(DAY_ID)
      expect(SEA).toHaveBeenCalledWith(DAY_ID)
    })
    expect(screen.queryByTestId("weather-chips")).not.toBeInTheDocument()
  })
})
