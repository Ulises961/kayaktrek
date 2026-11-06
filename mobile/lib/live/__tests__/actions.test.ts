import { ApiError, apiPost } from "../../api/client"
import { closeDay, getChangesPollUrl, getPositionsPollUrl } from "../actions"

jest.mock("../../api/client", () => {
  class MockApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return { apiPost: jest.fn(), ApiError: MockApiError }
})
jest.mock("../../api/config", () => ({
  API_PREFIX: "/api/v1",
  SSE_URL: "http://sse.test",
}))

const mockedApiPost = apiPost as jest.Mock
const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("getChangesPollUrl", () => {
  it("mints a changes ticket and returns the sidecar poll url carrying it", async () => {
    mockedApiPost.mockResolvedValue({ ticket: "tok-1" })

    const url = await getChangesPollUrl(TRIP_ID)

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/changes-ticket`, {})
    expect(url).toBe(`http://sse.test/api/v1/live/trip/${TRIP_ID}/changes?ticket=tok-1`)
  })

  it.each([403, 404])("returns null when the server refuses with %s: not on the trip", async (status) => {
    mockedApiPost.mockRejectedValue(new ApiError("refused", status))
    await expect(getChangesPollUrl(TRIP_ID)).resolves.toBeNull()
  })

  it.each([429, 500, 503])("throws on %s, so the poller backs off instead of concluding anything", async (status) => {
    mockedApiPost.mockRejectedValue(new ApiError("struggling", status))
    await expect(getChangesPollUrl(TRIP_ID)).rejects.toThrow("struggling")
  })

  it("lets a failed mint throw, so the caller backs off", async () => {
    mockedApiPost.mockRejectedValue(new Error("Could not reach the server."))
    await expect(getChangesPollUrl(TRIP_ID)).rejects.toThrow("Could not reach the server.")
  })

  it("rejects a response without a ticket rather than building a url from undefined", async () => {
    mockedApiPost.mockResolvedValue({})
    await expect(getChangesPollUrl(TRIP_ID)).rejects.toThrow()
  })
})

describe("getPositionsPollUrl", () => {
  it("mints a changes ticket, which is the poll's credential, and returns the positions url carrying it", async () => {
    mockedApiPost.mockResolvedValue({ ticket: "tok-2" })

    const url = await getPositionsPollUrl(TRIP_ID)

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/changes-ticket`, {})
    expect(url).toBe(`http://sse.test/api/v1/live/trip/${TRIP_ID}/positions?ticket=tok-2`)
  })

  it.each([403, 404])("returns null when the server refuses with %s: not on the trip", async (status) => {
    mockedApiPost.mockRejectedValue(new ApiError("refused", status))
    await expect(getPositionsPollUrl(TRIP_ID)).resolves.toBeNull()
  })

  it.each([429, 500, 503])("throws on %s, so the poller backs off instead of concluding anything", async (status) => {
    mockedApiPost.mockRejectedValue(new ApiError("struggling", status))
    await expect(getPositionsPollUrl(TRIP_ID)).rejects.toThrow("struggling")
  })

  it("rejects a response without a ticket rather than building a url from undefined", async () => {
    mockedApiPost.mockResolvedValue({})
    await expect(getPositionsPollUrl(TRIP_ID)).rejects.toThrow()
  })
})

describe("closeDay", () => {
  it("posts to the trip's close-day endpoint and returns the date that was closed", async () => {
    mockedApiPost.mockResolvedValue({ taskId: "task-1", date: "2026-11-06" })

    const result = await closeDay(TRIP_ID)

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/close-day`, {})
    expect(result).toEqual({ date: "2026-11-06" })
  })

  it("lets the server's reason through when it refuses, so the leader can be told", async () => {
    mockedApiPost.mockRejectedValue(new ApiError("There's no itinerary day scheduled for that date.", 409))

    await expect(closeDay(TRIP_ID)).rejects.toThrow("There's no itinerary day scheduled for that date.")
  })

  it("lets a failed request throw rather than reporting a day closed", async () => {
    mockedApiPost.mockRejectedValue(new Error("Could not reach the server."))

    await expect(closeDay(TRIP_ID)).rejects.toThrow("Could not reach the server.")
  })

  it("rejects an answer that does not say which day was closed", async () => {
    mockedApiPost.mockResolvedValue({ taskId: "task-1" })

    await expect(closeDay(TRIP_ID)).rejects.toThrow()
  })
})
