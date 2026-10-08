import { fireEvent, render, waitFor } from "@testing-library/react-native"

import type { Day } from "@shared/dtos/day"

import { refreshDayWeather } from "../../../lib/trips/actions"
import { WeatherSeaPanel, conditionsTeaser } from "../weather-sea-panel"

jest.mock("../../../lib/trips/actions", () => ({
  refreshDayWeather: jest.fn(),
}))

const mockRefreshDayWeather = refreshDayWeather as jest.Mock

const DAY_ID = "01998e2a-0000-7000-8000-000000000001"

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function dayWith(overrides: Partial<Day>): Day {
  return {
    id: DAY_ID,
    dayNumber: 1,
    weather: {
      dayId: DAY_ID,
      weatherStates: [{ dayId: DAY_ID, time: "12:00:00", temperature: 18 }],
      fetchedAt: isoMinutesAgo(45),
    },
    ...overrides,
  }
}

beforeEach(() => {
  mockRefreshDayWeather.mockReset()
})

describe("conditionsTeaser", () => {
  it("includes wave height when the sea state has one", () => {
    const day = dayWith({
      sea: {
        dayId: DAY_ID,
        seaStates: [{ dayId: DAY_ID, time: "12:00:00", waveHeight: 0.8, waveDirection: 210 }],
      },
    })
    expect(conditionsTeaser(day)).toBe("18°C · 0.8 m")
  })

  it("omits wave height, rather than crashing, when the marine data has none", () => {
    const day = dayWith({
      sea: {
        dayId: DAY_ID,
        seaStates: [{ dayId: DAY_ID, time: "12:00:00", waveHeight: null, waveDirection: null }],
      },
    })
    expect(conditionsTeaser(day)).toBe("18°C")
  })
})

describe("WeatherSeaPanel", () => {
  it("shows a 'forecast as of' label derived from weather.fetchedAt", async () => {
    const { getByText } = await render(<WeatherSeaPanel day={dayWith({})} />)
    expect(getByText(/Forecast as of 45 min ago/)).toBeTruthy()
  })

  it("falls back to sea.recordedAt when weather has no fetchedAt", async () => {
    const day: Day = {
      id: DAY_ID,
      dayNumber: 1,
      sea: {
        dayId: DAY_ID,
        seaStates: [{ dayId: DAY_ID, time: "12:00:00", waveHeight: 0.8, waveDirection: 210 }],
        recordedAt: isoMinutesAgo(10),
      },
    }
    const { getByText } = await render(<WeatherSeaPanel day={day} />)
    expect(getByText(/Forecast as of 10 min ago/)).toBeTruthy()
  })

  it("renders no refresh control when onRefresh is not supplied", async () => {
    const { queryByLabelText } = await render(<WeatherSeaPanel day={dayWith({})} />)
    expect(queryByLabelText("Refresh forecast")).toBeNull()
  })

  it("posts a refresh then calls onRefresh to re-pull", async () => {
    mockRefreshDayWeather.mockResolvedValue(undefined)
    const onRefresh = jest.fn().mockResolvedValue(undefined)
    const { getByLabelText } = await render(
      <WeatherSeaPanel day={dayWith({})} onRefresh={onRefresh} />,
    )

    await fireEvent.press(getByLabelText("Refresh forecast"))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    expect(mockRefreshDayWeather).toHaveBeenCalledWith(DAY_ID)
  })

  it("shows the server's message when refresh is gated behind the premium entitlement", async () => {
    mockRefreshDayWeather.mockRejectedValue(new Error("Weather refresh requires a premium plan"))
    const onRefresh = jest.fn()
    const { getByLabelText, findByText } = await render(
      <WeatherSeaPanel day={dayWith({})} onRefresh={onRefresh} />,
    )

    await fireEvent.press(getByLabelText("Refresh forecast"))

    expect(await findByText("Weather refresh requires a premium plan")).toBeTruthy()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  // M35 WP3: the hour a paddler taps in either grid is the hour the map overlay shows.
  describe("hour selection for the map overlay", () => {
    const dayWithSea = dayWith({
      sea: {
        dayId: DAY_ID,
        seaStates: [
          { dayId: DAY_ID, time: "12:00:00", waveHeight: 0.8, waveDirection: 210 },
          { dayId: DAY_ID, time: "15:00:00", waveHeight: 1.1, waveDirection: 215 },
        ],
      },
    })

    it("reports the hour tapped in the wind grid", async () => {
      const onHourChange = jest.fn()
      const { getAllByLabelText } = await render(
        <WeatherSeaPanel day={dayWithSea} onHourChange={onHourChange} />,
      )

      // The wind grid is first; the sea grid has the same 12:00 card after it.
      await fireEvent.press(getAllByLabelText("Show 12:00 on the map")[0])

      expect(onHourChange).toHaveBeenCalledWith(12)
    })

    it("reports the hour tapped in the sea grid", async () => {
      const onHourChange = jest.fn()
      const { getByLabelText } = await render(
        <WeatherSeaPanel day={dayWithSea} onHourChange={onHourChange} />,
      )

      await fireEvent.press(getByLabelText("Show 15:00 on the map"))

      expect(onHourChange).toHaveBeenCalledWith(15)
    })

    it("marks the selected hour in both grids", async () => {
      const { getAllByLabelText } = await render(
        <WeatherSeaPanel day={dayWithSea} selectedHour={12} onHourChange={jest.fn()} />,
      )

      const twelve = getAllByLabelText("Show 12:00 on the map")
      expect(twelve).toHaveLength(2)
      for (const card of twelve) {
        expect(card.props.accessibilityState).toMatchObject({ selected: true })
      }
    })

    it("leaves the grids as plain display when nothing is listening", async () => {
      const { queryByLabelText } = await render(<WeatherSeaPanel day={dayWithSea} />)

      expect(queryByLabelText("Show 12:00 on the map")).toBeNull()
    })
  })
})
