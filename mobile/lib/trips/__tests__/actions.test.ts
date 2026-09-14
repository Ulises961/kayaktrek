import { apiPost } from "../../api/client"
import { refreshDayWeather } from "../actions"

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
