import { ApiError, apiPost } from "../../api/client"
import { getChangesPollUrl } from "../actions"

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
