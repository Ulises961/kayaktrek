import { apiPost } from "../../api/client"
import { getChangesStreamUrl } from "../actions"

jest.mock("../../api/client", () => ({ apiPost: jest.fn() }))
jest.mock("../../api/config", () => ({
  API_PREFIX: "/api/v1",
  SSE_URL: "http://sse.test",
}))

const mockedApiPost = apiPost as jest.Mock
const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("getChangesStreamUrl", () => {
  it("mints a changes ticket and returns the sidecar stream url carrying it", async () => {
    mockedApiPost.mockResolvedValue({ ticket: "tok-1" })

    const url = await getChangesStreamUrl(TRIP_ID)

    expect(mockedApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/changes-ticket`, {})
    expect(url).toBe(`http://sse.test/api/v1/live/trip/${TRIP_ID}/changes?ticket=tok-1`)
  })

  it("lets a failed mint throw, so the caller backs off", async () => {
    mockedApiPost.mockRejectedValue(new Error("Could not reach the server."))
    await expect(getChangesStreamUrl(TRIP_ID)).rejects.toThrow("Could not reach the server.")
  })

  it("rejects a response without a ticket rather than building a url from undefined", async () => {
    mockedApiPost.mockResolvedValue({})
    await expect(getChangesStreamUrl(TRIP_ID)).rejects.toThrow()
  })
})
