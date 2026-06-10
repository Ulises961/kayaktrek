import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConditionsSection } from "../conditions-section"

vi.mock("@/lib/weather/actions", () => ({
  fetchDayWeather: vi.fn(),
  fetchDaySea: vi.fn(),
  fetchTidalGates: vi.fn(),
  triggerWeatherFetch: vi.fn(),
  updateDaySea: vi.fn(),
}))

import { fetchDayWeather, fetchDaySea, fetchTidalGates, triggerWeatherFetch } from "@/lib/weather/actions"
const WEATHER = fetchDayWeather as ReturnType<typeof vi.fn>
const SEA = fetchDaySea as ReturnType<typeof vi.fn>
const GATES = fetchTidalGates as ReturnType<typeof vi.fn>
const TRIGGER = triggerWeatherFetch as ReturnType<typeof vi.fn>

const DAY_ID = "01900000-0000-7000-8000-000000000001"

beforeEach(() => {
  vi.clearAllMocks()
  WEATHER.mockResolvedValue({ success: false, error: "x" })
  SEA.mockResolvedValue({ success: false, error: "x" })
  GATES.mockResolvedValue({ success: true, data: [] })
  TRIGGER.mockResolvedValue({ success: true, taskId: "t1" })
})

describe("ConditionsSection", () => {
  it("renders nothing for crew when there is no data", async () => {
    const { container } = render(<ConditionsSection dayId={DAY_ID} isLeader={false} />)
    await waitFor(() => expect(WEATHER).toHaveBeenCalledWith(DAY_ID))
    expect(container).toBeEmptyDOMElement()
  })

  it("always renders for a leader so they can enter data", async () => {
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    expect(await screen.findByTestId("conditions-section")).toBeInTheDocument()
  })

  it("shows the weather grid once expanded when weather data is present", async () => {
    WEATHER.mockResolvedValue({
      success: true,
      data: {
        dayId: DAY_ID,
        model: "gfs",
        weatherStates: [
          { dayId: DAY_ID, time: "12:00:00", temperature: 18, precipitation: 0, windDirection: 247, windForce: 12, cloud: null },
        ],
      },
    })
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    await screen.findByTestId("conditions-section")
    await userEvent.click(screen.getByRole("button", { name: /conditions/i }))
    expect(await screen.findByTestId("weather-grid")).toBeInTheDocument()
    expect(screen.getByText("12:00")).toBeInTheDocument()
  })

  it("triggers a weather fetch and reloads on Refresh", async () => {
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    await screen.findByTestId("conditions-section")
    await userEvent.click(screen.getByRole("button", { name: /conditions/i }))
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))
    await waitFor(() => expect(TRIGGER).toHaveBeenCalledWith(DAY_ID))
    // initial load + reload after trigger
    await waitFor(() => expect(WEATHER).toHaveBeenCalledTimes(2))
  })

  it("shows the rule of 12s table and source label when tidal data is present", async () => {
    SEA.mockResolvedValue({
      success: true,
      data: {
        dayId: DAY_ID,
        highTide: "09:42",
        lowTide: "03:10",
        tidalRangeM: 5.0,
        tidalSource: "manual",
        ruleOfTwelfths: [
          { hourFromLw: 0, cumulativeFraction: 0, estimatedHeightM: 0 },
          { hourFromLw: 6, cumulativeFraction: 1, estimatedHeightM: 5.0 },
        ],
      },
    })
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    await screen.findByTestId("conditions-section")
    await userEvent.click(screen.getByRole("button", { name: /conditions/i }))
    expect(await screen.findByTestId("rule-of-twelfths")).toBeInTheDocument()
    expect(screen.getByText("Tidal data: manual")).toBeInTheDocument()
  })
})
