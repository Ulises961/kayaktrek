import { apiPost } from "../../api/client"
import { TRIP_STATE } from "@shared/dtos/trip"

import { createTrip, refreshDayWeather, startTrip } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiPost = apiPost as jest.Mock

beforeEach(() => {
  mockApiPost.mockReset()
})

describe("refreshDayWeather", () => {
  it("posts to /api/day/<id>/weather/refresh", async () => {
    mockApiPost.mockResolvedValue({ taskId: "task-1" })
    await refreshDayWeather("day-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/day/day-1/weather/refresh", {})
  })

  it("propagates the 403 premium-entitlement message unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("Weather refresh requires a premium plan"))
    await expect(refreshDayWeather("day-1")).rejects.toThrow("premium plan")
  })

  it("propagates the 429 cooldown message unchanged", async () => {
    mockApiPost.mockRejectedValue(
      new Error("Weather was just refreshed for this day — try again shortly"),
    )
    await expect(refreshDayWeather("day-1")).rejects.toThrow("try again shortly")
  })
})

describe("createTrip", () => {
  it("posts the fields to /api/trip/create and returns the new trip's id", async () => {
    mockApiPost.mockResolvedValue({ id: "trip-1" })
    const id = await createTrip({
      destination: "Shetland",
      description: "Week round Unst",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-05",
    })
    expect(id).toBe("trip-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/trip/create", {
      destination: "Shetland",
      description: "Week round Unst",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-05",
    })
  })

  it("refuses an end date before the start date without calling the server", async () => {
    await expect(
      createTrip({ destination: "Shetland", dateFrom: "2026-12-05", dateTo: "2026-12-01" }),
    ).rejects.toThrow("End date must be on or after the start date.")
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("propagates the server's refusal unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("Database integrity constraint violated"))
    await expect(createTrip({ destination: "Shetland" })).rejects.toThrow("integrity")
  })
})

describe("startTrip", () => {
  it("posts the happening state to /api/trip/<id>/state", async () => {
    mockApiPost.mockResolvedValue({})
    await startTrip("trip-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/trip/trip-1/state", {
      state: TRIP_STATE.HAPPENING,
    })
  })

  it("propagates the server's reason for refusing the transition", async () => {
    mockApiPost.mockRejectedValue(new Error("Cannot transition from past to happening"))
    await expect(startTrip("trip-1")).rejects.toThrow("Cannot transition")
  })
})
