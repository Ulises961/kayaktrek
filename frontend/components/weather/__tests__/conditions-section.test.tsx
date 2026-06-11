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

  it("shows the Bft badge and summary when weather data is present", async () => {
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
    SEA.mockResolvedValue({
      success: true,
      data: { dayId: DAY_ID, seaStates: [
        { dayId: DAY_ID, time: "12:00:00", waveHeight: 1.2, waveDirection: 270, swellDirection: 280, swellPeriod: 8 },
      ]},
    })
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    await screen.findByTestId("conditions-section")
    // Badge — combinedSeaState(12 kn wind → Bft 4, 1.2 m wave → Bft 4) = Bft 4
    expect(await screen.findByText("4")).toBeInTheDocument()
    expect(screen.getByText(/Moderate breeze/i)).toBeInTheDocument()
  })

  it("shows the weather grid once the hourly accordion is expanded", async () => {
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
    await userEvent.click(await screen.findByRole("button", { name: /hourly/i }))
    expect(await screen.findByTestId("weather-grid")).toBeInTheDocument()
    expect(await screen.findByText("12:00")).toBeInTheDocument()
  })

  it("triggers a weather fetch via the Refresh button in the summary strip", async () => {
    render(<ConditionsSection dayId={DAY_ID} isLeader />)
    await screen.findByTestId("conditions-section")
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))
    await waitFor(() => expect(TRIGGER).toHaveBeenCalledWith(DAY_ID))
  })

  it("shows the rule of 12s table and source label after opening the tide accordion", async () => {
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
    await userEvent.click(await screen.findByRole("button", { name: /^tide$/i }))
    expect(await screen.findByTestId("rule-of-twelfths")).toBeInTheDocument()
    expect(screen.getByText("Tidal data: manual")).toBeInTheDocument()
  })
})
