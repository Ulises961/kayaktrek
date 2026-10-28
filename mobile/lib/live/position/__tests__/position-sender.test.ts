import { ApiError, OFFLINE_ERROR_MESSAGE, SessionExpiredError, apiPost } from "../../../api/client"
import { sendPositionPing } from "../position-sender"
import { SEND_FAILURE, STOP_REASON, type PositionFix } from "../types"

jest.mock("../../../api/client", () => {
  const actual = jest.requireActual("../../../api/client")
  return { ...actual, apiPost: jest.fn() }
})

const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>

const FIX: PositionFix = {
  lat: 46.1,
  lon: 11.2,
  accuracyM: 12,
  headingDeg: 90,
  speedMs: 1.5,
  timestamp: Date.UTC(2026, 9, 28, 12, 0, 0),
}

beforeEach(() => apiPostMock.mockReset())

describe("sendPositionPing", () => {
  it("posts the fix to the trip's position endpoint with the device's own time", async () => {
    apiPostMock.mockResolvedValue({})
    const outcome = await sendPositionPing("trip-1", FIX)
    expect(outcome).toEqual({ kind: "sent" })
    expect(apiPostMock).toHaveBeenCalledWith("/api/live/trip/trip-1/position", {
      lat: 46.1,
      lon: 11.2,
      accuracyM: 12,
      headingDeg: 90,
      speedMs: 1.5,
      recordedAt: "2026-10-28T12:00:00.000Z",
    })
  })

  it("leaves out what the phone did not know rather than sending a made-up value", async () => {
    apiPostMock.mockResolvedValue({})
    await sendPositionPing("trip-1", { ...FIX, accuracyM: null, headingDeg: null, speedMs: null })
    const body = apiPostMock.mock.calls[0][1] as Record<string, unknown>
    expect(body).not.toHaveProperty("accuracyM")
    expect(body).not.toHaveProperty("headingDeg")
    expect(body).not.toHaveProperty("speedMs")
  })

  it("stops the share when the trip is no longer happening", async () => {
    apiPostMock.mockRejectedValue(new ApiError("The trip must be happening", 409))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "stop", reason: STOP_REASON.TRIP_NOT_LIVE })
  })

  it.each([403, 404])("stops the share when the server says the caller is not on the trip (%i)", async (status) => {
    apiPostMock.mockRejectedValue(new ApiError("no", status))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "stop", reason: STOP_REASON.NOT_ON_TRIP })
  })

  it("retries on the next fix when the server is busy", async () => {
    apiPostMock.mockRejectedValue(new ApiError("slow down", 429))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.RATE_LIMITED })
  })

  it("retries when the server fails", async () => {
    apiPostMock.mockRejectedValue(new ApiError("boom", 503))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.SERVER })
  })

  it("retries, and names it, when the server refuses the ping", async () => {
    apiPostMock.mockRejectedValue(new ApiError("bad", 400))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.REJECTED })
  })

  it("retries, and names it, when there is no connection", async () => {
    apiPostMock.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.OFFLINE })
  })

  it("keeps sharing, and names it, when the session has died", async () => {
    apiPostMock.mockRejectedValue(new SessionExpiredError())
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.SESSION })
  })

  it("treats an error it does not recognise as a server problem, not as the end of the share", async () => {
    apiPostMock.mockRejectedValue(new Error("something else"))
    expect(await sendPositionPing("trip-1", FIX)).toEqual({ kind: "retry", reason: SEND_FAILURE.SERVER })
  })
})
