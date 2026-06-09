import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchDaySea, updateDaySea, fetchDayWeather, triggerWeatherFetch, fetchTidalGates } from "../actions"

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
    expect(result).toEqual({ success: true, data: expect.objectContaining({ dayId: DAY_ID, highTide: "09:42" }) })
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
    expect(PATCH).toHaveBeenCalledWith(`/api/day/${DAY_ID}/sea`, { highTide: "09:42", tidalRangeM: 4.2 })
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
    expect(result).toEqual({ success: true, data: expect.objectContaining({ dayId: DAY_ID, model: "gfs" }) })
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
