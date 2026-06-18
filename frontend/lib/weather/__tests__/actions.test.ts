import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchDaySea,
  updateDaySea,
  fetchDayWeather,
  triggerWeatherFetch,
  fetchTidalGates,
  fetchWindVectors,
  fetchWaveVectors,
  fetchTidalDiamonds,
  fetchGlobalWindVectors,
} from "../actions"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { apiGet, apiPost, apiPatch } from "@/lib/api/client"

const GET = apiGet as ReturnType<typeof vi.fn>
const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>

const DAY_ID = "01900000-0000-7000-8000-000000000001"
const POINT_ID = "01900000-0000-7000-8000-000000000002"

const seaFixture = {
  dayId: DAY_ID,
  moonPhase: null,
  highTide: "09:42",
  lowTide: "15:55",
  tidalRangeM: 4.2,
  seaStates: [
    {
      dayId: DAY_ID,
      time: "12:00",
      waveHeight: 1.2,
      waveDirection: 270,
      swellDirection: 280,
      swellPeriod: 8,
      currentSpeed: null,
      currentDirection: null,
    },
  ],
  recordedAt: null,
  ruleOfTwelfths: null,
}

const weatherFixture = {
  dayId: DAY_ID,
  model: "gfs",
  weatherStates: [
    {
      dayId: DAY_ID,
      time: "12:00",
      temperature: 18,
      precipitation: 0,
      windDirection: 270,
      windForce: 15,
      cloud: "partly_cloudy",
    },
  ],
}

const tidalGatesFixture = [
  {
    pointId: POINT_ID,
    stationName: "Ramsey Sound",
    rateKnots: 3.1,
    directionDegrees: 185,
    nextSlackUtc: "2026-07-01T10:00:00Z",
    isBlocking: true,
  },
]

beforeEach(() => vi.clearAllMocks())

describe("fetchDaySea", () => {
  it("gets /api/day/:id/sea and parses the response", async () => {
    GET.mockResolvedValue(seaFixture)
    const result = await fetchDaySea(DAY_ID)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/sea`)
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ dayId: DAY_ID, highTide: "09:42" }),
    })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("Not found"))
    const result = await fetchDaySea(DAY_ID)
    expect(result).toEqual({ success: false, error: "Not found" })
  })
})

describe("updateDaySea", () => {
  it("patches /api/day/:id/sea with fields and parses response", async () => {
    PATCH.mockResolvedValue(seaFixture)
    const result = await updateDaySea(DAY_ID, { highTide: "09:42", tidalRangeM: 4.2 })
    expect(PATCH).toHaveBeenCalledWith(`/api/day/${DAY_ID}/sea`, {
      highTide: "09:42",
      tidalRangeM: 4.2,
    })
    expect(result).toEqual({ success: true, data: expect.objectContaining({ dayId: DAY_ID }) })
  })

  it("returns error on failure", async () => {
    PATCH.mockRejectedValue(new Error("Forbidden"))
    const result = await updateDaySea(DAY_ID, {})
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })
})

describe("fetchDayWeather", () => {
  it("gets /api/day/:id/weather and parses the response", async () => {
    GET.mockResolvedValue(weatherFixture)
    const result = await fetchDayWeather(DAY_ID)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/weather`)
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ dayId: DAY_ID, model: "gfs" }),
    })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("Not found"))
    const result = await fetchDayWeather(DAY_ID)
    expect(result).toEqual({ success: false, error: "Not found" })
  })
})

describe("triggerWeatherFetch", () => {
  it("posts to /api/day/:id/weather/fetch and returns taskId", async () => {
    POST.mockResolvedValue({ taskId: "task-abc" })
    const result = await triggerWeatherFetch(DAY_ID)
    expect(POST).toHaveBeenCalledWith(`/api/day/${DAY_ID}/weather/fetch`, {})
    expect(result).toEqual({ success: true, taskId: "task-abc" })
  })

  it("returns error when date is not set (400)", async () => {
    POST.mockRejectedValue(new Error("Day date is not set"))
    const result = await triggerWeatherFetch(DAY_ID)
    expect(result).toEqual({ success: false, error: "Day date is not set" })
  })
})

describe("fetchTidalGates", () => {
  it("gets /api/day/:id/tidal-gates and parses the response", async () => {
    GET.mockResolvedValue(tidalGatesFixture)
    const result = await fetchTidalGates(DAY_ID)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/tidal-gates`)
    expect(result).toEqual({
      success: true,
      data: [expect.objectContaining({ stationName: "Ramsey Sound", isBlocking: true })],
    })
  })

  it("returns empty array when no gates", async () => {
    GET.mockResolvedValue([])
    const result = await fetchTidalGates(DAY_ID)
    expect(result).toEqual({ success: true, data: [] })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("Server error"))
    const result = await fetchTidalGates(DAY_ID)
    expect(result).toEqual({ success: false, error: "Server error" })
  })
})

const velocityGridFixture = {
  source: "station" as const,
  grid: [
    {
      header: {
        parameterUnit: "m.s-1",
        parameterNumberName: "eastward_component",
        la1: 51.5,
        la2: 52.0,
        lo1: -5.5,
        lo2: -5.0,
        nx: 5,
        ny: 5,
        dx: 0.1,
        dy: 0.1,
      },
      data: [0.1, 0.2, 0.3, 0.4, 0.5],
    },
  ],
}

describe("fetchWindVectors", () => {
  it("gets /api/day/:id/wind-vectors?hour=12", async () => {
    GET.mockResolvedValue(velocityGridFixture)
    const result = await fetchWindVectors(DAY_ID, 12)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/wind-vectors?hour=12`)
    expect(result).toEqual({ success: true, data: velocityGridFixture })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("No data"))
    const result = await fetchWindVectors(DAY_ID, 12)
    expect(result).toEqual({ success: false, error: "No data" })
  })
})

describe("fetchWaveVectors", () => {
  it("gets /api/day/:id/wave-vectors?hour=12", async () => {
    GET.mockResolvedValue(velocityGridFixture)
    const result = await fetchWaveVectors(DAY_ID, 12)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/wave-vectors?hour=12`)
    expect(result).toEqual({ success: true, data: velocityGridFixture })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("No data"))
    const result = await fetchWaveVectors(DAY_ID, 12)
    expect(result).toEqual({ success: false, error: "No data" })
  })
})

describe("fetchTidalDiamonds", () => {
  const DIAMOND = {
    id: "01900000-0000-7000-8000-0000000000aa",
    name: "Race",
    lat: 50.3,
    lng: -4.1,
    directionDegrees: 225,
    rateKnots: 1.8,
    source: "simple",
    radiusM: 500,
    isUserCreated: true,
    hourlyTable: [{ hourFromHw: 0, rateKnots: 1.0, directionDegrees: 225 }],
  }

  it("gets /api/day/:id/tidal-diamonds?hour=12 and parses the list", async () => {
    GET.mockResolvedValue([DIAMOND])
    const result = await fetchTidalDiamonds(DAY_ID, 12)
    expect(GET).toHaveBeenCalledWith(`/api/day/${DAY_ID}/tidal-diamonds?hour=12`)
    expect(result).toEqual({ success: true, data: [DIAMOND] })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("No data"))
    const result = await fetchTidalDiamonds(DAY_ID, 12)
    expect(result).toEqual({ success: false, error: "No data" })
  })
})

describe("fetchGlobalWindVectors", () => {
  it("gets /api/day/global-wind-vectors?date=2026-07-15&hour=12", async () => {
    GET.mockResolvedValue({ source: "global_weather", grid: [] })
    const result = await fetchGlobalWindVectors("2026-07-15", 12)
    expect(GET).toHaveBeenCalledWith("/api/day/global-wind-vectors?date=2026-07-15&hour=12")
    expect(result).toEqual({ success: true, data: { source: "global_weather", grid: [] } })
  })

  it("returns error on failure", async () => {
    GET.mockRejectedValue(new Error("No data"))
    const result = await fetchGlobalWindVectors("2026-07-15", 12)
    expect(result).toEqual({ success: false, error: "No data" })
  })
})
