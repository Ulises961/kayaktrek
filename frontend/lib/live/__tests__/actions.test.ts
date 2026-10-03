import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }))

vi.mock("@/lib/api/client", () => ({
  apiPost: mockApiPost,
  isRedirectError: () => false,
}))

import { sendPositionPing, getStreamTicket, getChangesStreamUrl, closeDay } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sendPositionPing", () => {
  it("posts the ping to the trip's position endpoint", async () => {
    mockApiPost.mockResolvedValue({ id: "ping-1" })
    const result = await sendPositionPing(TRIP_ID, { lat: 43.1, lon: 13.2 })
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/position`, {
      lat: 43.1,
      lon: 13.2,
    })
    expect(result).toEqual({ success: true })
  })

  it("forwards optional fields when present", async () => {
    mockApiPost.mockResolvedValue({ id: "ping-1" })
    await sendPositionPing(TRIP_ID, {
      lat: 43.1,
      lon: 13.2,
      accuracyM: 5,
      headingDeg: 90,
      speedMs: 1.2,
    })
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/position`, {
      lat: 43.1,
      lon: 13.2,
      accuracyM: 5,
      headingDeg: 90,
      speedMs: 1.2,
    })
  })

  it("returns a failure result instead of throwing on error", async () => {
    mockApiPost.mockRejectedValue(new Error("POST failed: 409"))
    const result = await sendPositionPing(TRIP_ID, { lat: 43.1, lon: 13.2 })
    expect(result).toEqual({ success: false, error: "POST failed: 409" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await sendPositionPing(TRIP_ID, { lat: 43.1, lon: 13.2 })
    expect(result).toEqual({ success: false, error: "Failed to send position." })
  })
})

describe("getStreamTicket", () => {
  it("returns the full sidecar stream URL with the minted ticket", async () => {
    mockApiPost.mockResolvedValue({ ticket: "tok-abc" })
    const url = await getStreamTicket(TRIP_ID)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/stream-ticket`, {})
    expect(url).toBe(`http://localhost:5001/api/v1/live/trip/${TRIP_ID}/stream?ticket=tok-abc`)
  })

  it("returns null on failure", async () => {
    mockApiPost.mockRejectedValue(new Error("nope"))
    const url = await getStreamTicket(TRIP_ID)
    expect(url).toBeNull()
  })
})

describe("getChangesStreamUrl", () => {
  it("returns the sidecar changes URL with the minted ticket", async () => {
    mockApiPost.mockResolvedValue({ ticket: "tok-xyz" })
    const url = await getChangesStreamUrl(TRIP_ID)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/changes-ticket`, {})
    expect(url).toBe(`http://localhost:5001/api/v1/live/trip/${TRIP_ID}/changes?ticket=tok-xyz`)
  })

  it("returns null on failure", async () => {
    mockApiPost.mockRejectedValue(new Error("nope"))
    expect(await getChangesStreamUrl(TRIP_ID)).toBeNull()
  })
})

describe("closeDay", () => {
  it("posts with no body when no date is given", async () => {
    mockApiPost.mockResolvedValue({ taskId: "task-1", date: "2026-07-21" })
    const result = await closeDay(TRIP_ID)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/close-day`, {})
    expect(result).toEqual({ success: true })
  })

  it("forwards an explicit date", async () => {
    mockApiPost.mockResolvedValue({ taskId: "task-1", date: "2026-07-19" })
    await closeDay(TRIP_ID, "2026-07-19")
    expect(mockApiPost).toHaveBeenCalledWith(`/api/live/trip/${TRIP_ID}/close-day`, {
      date: "2026-07-19",
    })
  })

  it("returns a failure result instead of throwing on error", async () => {
    mockApiPost.mockRejectedValue(new Error("POST failed: 409"))
    const result = await closeDay(TRIP_ID)
    expect(result).toEqual({ success: false, error: "POST failed: 409" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await closeDay(TRIP_ID)
    expect(result).toEqual({ success: false, error: "Failed to close the day." })
  })
})
