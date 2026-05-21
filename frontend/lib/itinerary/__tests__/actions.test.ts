import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockApiPost, mockRevalidatePath } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))

vi.mock("@/lib/api/client", () => ({ apiPost: mockApiPost, isRedirectError: () => false }))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))

import { createItinerary } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"

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
