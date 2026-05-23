import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockApiPost, mockApiPatch, mockApiDelete, mockRevalidatePath } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
  mockApiDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))

vi.mock("@/lib/api/client", () => ({
  apiPost: mockApiPost,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
  isRedirectError: () => false,
}))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))

import { createItinerary, createPoint, updatePoint, deletePoint } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"
const DAY_ID = "01952f1a-0000-7000-8000-000000000003"
const POINT_ID = "01952f1a-0000-7000-8000-000000000004"

const POINT_RESPONSE = {
  id: POINT_ID,
  type: "position",
  latitude: 44.5,
  longitude: 14.2,
  dayId: DAY_ID,
}

beforeEach(() => vi.clearAllMocks())

describe("createItinerary", () => {
  it("returns success with itineraryId on successful creation", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    const result = await createItinerary(TRIP_ID)
    expect(result).toEqual({ success: true, itineraryId: ITINERARY_ID })
  })

  it("posts to /api/itinerary/create with tripId", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary(TRIP_ID)
    expect(mockApiPost).toHaveBeenCalledWith("/api/itinerary/create", { tripId: TRIP_ID })
  })

  it("revalidates the trip page on success", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary(TRIP_ID)
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns error result when the API throws", async () => {
    mockApiPost.mockRejectedValue(new Error("Conflict"))
    const result = await createItinerary(TRIP_ID)
    expect(result).toEqual({ success: false, error: "Conflict" })
  })

  it("returns a generic error message for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("unknown")
    const result = await createItinerary(TRIP_ID)
    expect(result).toEqual({ success: false, error: "Failed to create itinerary." })
  })
})

describe("createPoint", () => {
  it("posts to /api/point/create with dayId and fields", async () => {
    mockApiPost.mockResolvedValue(POINT_RESPONSE)
    await createPoint(DAY_ID, { type: "position", latitude: 44.5, longitude: 14.2 })
    expect(mockApiPost).toHaveBeenCalledWith("/api/point/create", {
      dayId: DAY_ID,
      type: "position",
      latitude: 44.5,
      longitude: 14.2,
    })
  })

  it("returns success with the parsed point on success", async () => {
    mockApiPost.mockResolvedValue(POINT_RESPONSE)
    const result = await createPoint(DAY_ID, { type: "position", latitude: 44.5, longitude: 14.2 })
    expect(result).toMatchObject({ success: true, point: expect.objectContaining({ id: POINT_ID }) })
  })

  it("returns error result when the API throws", async () => {
    mockApiPost.mockRejectedValue(new Error("Bad Request"))
    const result = await createPoint(DAY_ID, { type: "position", latitude: 44.5, longitude: 14.2 })
    expect(result).toEqual({ success: false, error: "Bad Request" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await createPoint(DAY_ID, { type: "stop", latitude: 44, longitude: 14 })
    expect(result).toEqual({ success: false, error: "Failed to create point." })
  })
})

describe("updatePoint", () => {
  it("patches /api/point/:id with the given fields", async () => {
    mockApiPatch.mockResolvedValue(POINT_RESPONSE)
    await updatePoint(POINT_ID, { type: "stop" })
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/point/${POINT_ID}`, { type: "stop" })
  })

  it("returns success with the parsed point on success", async () => {
    mockApiPatch.mockResolvedValue(POINT_RESPONSE)
    const result = await updatePoint(POINT_ID, { latitude: 44.6, longitude: 14.3 })
    expect(result).toMatchObject({ success: true, point: expect.objectContaining({ id: POINT_ID }) })
  })

  it("returns error result when the API throws", async () => {
    mockApiPatch.mockRejectedValue(new Error("Not Found"))
    const result = await updatePoint(POINT_ID, { type: "interest" })
    expect(result).toEqual({ success: false, error: "Not Found" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPatch.mockRejectedValue(42)
    const result = await updatePoint(POINT_ID, { type: "position" })
    expect(result).toEqual({ success: false, error: "Failed to update point." })
  })
})

describe("deletePoint", () => {
  it("sends DELETE to /api/point/:id", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await deletePoint(POINT_ID)
    expect(mockApiDelete).toHaveBeenCalledWith(`/api/point/${POINT_ID}`)
  })

  it("returns success: true on success", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    const result = await deletePoint(POINT_ID)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false with error message on failure", async () => {
    mockApiDelete.mockRejectedValue(new Error("Forbidden"))
    const result = await deletePoint(POINT_ID)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiDelete.mockRejectedValue(null)
    const result = await deletePoint(POINT_ID)
    expect(result).toEqual({ success: false, error: "Failed to delete point." })
  })
})
