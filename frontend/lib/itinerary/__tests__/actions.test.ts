import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockApiPost, mockApiPatch, mockApiDelete, mockApiUpload, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockApiPost: vi.fn(),
    mockApiPatch: vi.fn(),
    mockApiDelete: vi.fn(),
    mockApiUpload: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
)

vi.mock("@/lib/api/client", () => ({
  apiPost: mockApiPost,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
  apiUpload: mockApiUpload,
  isRedirectError: () => false,
}))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))

import {
  createItinerary,
  createTripFromItinerary,
  createPoint,
  updatePoint,
  deletePoint,
  deleteItinerary,
  createDay,
  updateDay,
  assignPointsToDay,
  applyBoundaries,
  generateStoryShare,
  setImagePublic,
  uploadPointImage,
  deletePointImage,
} from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"
const DAY_ID = "01952f1a-0000-7000-8000-000000000003"
const POINT_ID = "01952f1a-0000-7000-8000-000000000004"
const DAY_ID_2 = "01952f1a-0000-7000-8000-000000000005"
const ITINERARY_ID_2 = "01952f1a-0000-7000-8000-000000000006"
const START_PT = "01952f1a-0000-7000-8000-000000000007"
const END_PT = "01952f1a-0000-7000-8000-000000000008"
const IMAGE_ID = "01952f1a-0000-7000-8000-000000000009"

const DAY_RESPONSE = { id: DAY_ID_2, dayNumber: 1, itineraryId: ITINERARY_ID_2 }

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
    const result = await createItinerary({ tripId: TRIP_ID })
    expect(result).toEqual({ success: true, itineraryId: ITINERARY_ID })
  })

  it("posts to /api/itinerary/create with tripId and name", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary({ tripId: TRIP_ID, name: "My Route" })
    expect(mockApiPost).toHaveBeenCalledWith("/api/itinerary/create", {
      tripId: TRIP_ID,
      name: "My Route",
    })
  })

  it("omits tripId from body when not provided", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary({ name: "Standalone Route" })
    expect(mockApiPost).toHaveBeenCalledWith("/api/itinerary/create", { name: "Standalone Route" })
  })

  it("revalidates the trip page on success when tripId given", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary({ tripId: TRIP_ID })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("revalidates /itinerary listing on success", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID })
    await createItinerary({ name: "Solo Route" })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
  })

  it("returns error result when the API throws", async () => {
    mockApiPost.mockRejectedValue(new Error("Conflict"))
    const result = await createItinerary({ tripId: TRIP_ID })
    expect(result).toEqual({ success: false, error: "Conflict" })
  })

  it("returns a generic error message for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("unknown")
    const result = await createItinerary({ tripId: TRIP_ID })
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
    expect(result).toMatchObject({
      success: true,
      point: expect.objectContaining({ id: POINT_ID }),
    })
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
    expect(result).toMatchObject({
      success: true,
      point: expect.objectContaining({ id: POINT_ID }),
    })
  })

  it("returns error result when the API throws", async () => {
    mockApiPatch.mockRejectedValue(new Error("Not Found"))
    const result = await updatePoint(POINT_ID, { type: "stop" })
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

describe("deleteItinerary", () => {
  it("sends DELETE to /api/itinerary/:id", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await deleteItinerary(ITINERARY_ID)
    expect(mockApiDelete).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}`)
  })

  it("returns success: true on success", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    const result = await deleteItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false with error message on failure", async () => {
    mockApiDelete.mockRejectedValue(new Error("Forbidden"))
    const result = await deleteItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })
})

describe("createDay", () => {
  it("posts to /api/day/create with itineraryId and dayNumber", async () => {
    mockApiPost.mockResolvedValue(DAY_RESPONSE)
    await createDay(ITINERARY_ID_2, 1)
    expect(mockApiPost).toHaveBeenCalledWith("/api/day/create", {
      itineraryId: ITINERARY_ID_2,
      dayNumber: 1,
    })
  })

  it("returns success with the parsed day", async () => {
    mockApiPost.mockResolvedValue(DAY_RESPONSE)
    const result = await createDay(ITINERARY_ID_2, 1)
    expect(result).toMatchObject({ success: true, day: expect.objectContaining({ id: DAY_ID_2 }) })
  })

  it("returns error on API failure", async () => {
    mockApiPost.mockRejectedValue(new Error("Server Error"))
    const result = await createDay(ITINERARY_ID_2, 1)
    expect(result).toEqual({ success: false, error: "Server Error" })
  })

  it("returns generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await createDay(ITINERARY_ID_2, 1)
    expect(result).toEqual({ success: false, error: "Failed to create day." })
  })
})

describe("updateDay", () => {
  it("patches /api/day/:id with the given fields", async () => {
    mockApiPatch.mockResolvedValue(DAY_RESPONSE)
    await updateDay(DAY_ID_2, { date: "2026-06-01" })
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/day/${DAY_ID_2}`, { date: "2026-06-01" })
  })

  it("returns success with the parsed day", async () => {
    mockApiPatch.mockResolvedValue(DAY_RESPONSE)
    const result = await updateDay(DAY_ID_2, { endPointId: END_PT })
    expect(result).toMatchObject({ success: true, day: expect.objectContaining({ id: DAY_ID_2 }) })
  })

  it("returns error on API failure", async () => {
    mockApiPatch.mockRejectedValue(new Error("Not Found"))
    const result = await updateDay(DAY_ID_2, { date: "2026-06-01" })
    expect(result).toEqual({ success: false, error: "Not Found" })
  })

  it("returns generic error for non-Error throws", async () => {
    mockApiPatch.mockRejectedValue(null)
    const result = await updateDay(DAY_ID_2, { endPointId: END_PT })
    expect(result).toEqual({ success: false, error: "Failed to update day." })
  })
})

describe("applyBoundaries", () => {
  const PAYLOAD = {
    boundaries: [{ dayId: DAY_ID, startPointId: START_PT, endPointId: END_PT, date: "2024-06-01" }],
    points: [{ id: START_PT, type: "stop" as const }],
  }
  const ITINERARY_RESPONSE = { id: ITINERARY_ID, name: "Test Route", days: [] }

  it("posts to /api/itinerary/:id/apply-boundaries with the payload", async () => {
    mockApiPost.mockResolvedValue(ITINERARY_RESPONSE)
    await applyBoundaries(ITINERARY_ID, PAYLOAD)
    expect(mockApiPost).toHaveBeenCalledWith(
      `/api/itinerary/${ITINERARY_ID}/apply-boundaries`,
      PAYLOAD,
    )
  })

  it("returns success with the parsed itinerary on success", async () => {
    mockApiPost.mockResolvedValue(ITINERARY_RESPONSE)
    const result = await applyBoundaries(ITINERARY_ID, PAYLOAD)
    expect(result).toMatchObject({
      success: true,
      itinerary: expect.objectContaining({ id: ITINERARY_ID }),
    })
  })

  it("returns error result when the API throws", async () => {
    mockApiPost.mockRejectedValue(new Error("Conflict"))
    const result = await applyBoundaries(ITINERARY_ID, PAYLOAD)
    expect(result).toEqual({ success: false, error: "Conflict" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await applyBoundaries(ITINERARY_ID, PAYLOAD)
    expect(result).toEqual({ success: false, error: "Failed to apply boundaries." })
  })
})

describe("assignPointsToDay", () => {
  it("posts to /api/day/:id/assign with startPointId and endPointId", async () => {
    mockApiPost.mockResolvedValue({})
    await assignPointsToDay(DAY_ID_2, START_PT, END_PT)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/day/${DAY_ID_2}/assign`, {
      startPointId: START_PT,
      endPointId: END_PT,
    })
  })

  it("returns success: true on success", async () => {
    mockApiPost.mockResolvedValue({})
    const result = await assignPointsToDay(DAY_ID_2, START_PT, END_PT)
    expect(result).toEqual({ success: true })
  })

  it("returns error on API failure", async () => {
    mockApiPost.mockRejectedValue(new Error("Bad Request"))
    const result = await assignPointsToDay(DAY_ID_2, START_PT, END_PT)
    expect(result).toEqual({ success: false, error: "Bad Request" })
  })

  it("returns generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue(undefined)
    const result = await assignPointsToDay(DAY_ID_2, START_PT, END_PT)
    expect(result).toEqual({ success: false, error: "Failed to assign points." })
  })
})

const TRIP_ID_NEW = "01952f1a-0000-7000-8000-000000000099"

describe("createTripFromItinerary", () => {
  it("posts to /api/trip/create with destination trimmed", async () => {
    mockApiPost.mockResolvedValue({ id: TRIP_ID_NEW })
    mockApiPatch.mockResolvedValue({})
    await createTripFromItinerary(ITINERARY_ID, "  Galicia Coast  ")
    expect(mockApiPost).toHaveBeenCalledWith("/api/trip/create", { destination: "Galicia Coast" })
  })

  it("patches the itinerary with the new tripId", async () => {
    mockApiPost.mockResolvedValue({ id: TRIP_ID_NEW })
    mockApiPatch.mockResolvedValue({})
    await createTripFromItinerary(ITINERARY_ID, "Galicia Coast")
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}`, {
      tripId: TRIP_ID_NEW,
    })
  })

  it("returns success with the new tripId", async () => {
    mockApiPost.mockResolvedValue({ id: TRIP_ID_NEW })
    mockApiPatch.mockResolvedValue({})
    const result = await createTripFromItinerary(ITINERARY_ID, "Galicia Coast")
    expect(result).toEqual({ success: true, tripId: TRIP_ID_NEW })
  })

  it("revalidates /itinerary and the trip page", async () => {
    mockApiPost.mockResolvedValue({ id: TRIP_ID_NEW })
    mockApiPatch.mockResolvedValue({})
    await createTripFromItinerary(ITINERARY_ID, "Galicia Coast")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID_NEW}`)
  })

  it("returns error when trip creation fails", async () => {
    mockApiPost.mockRejectedValue(new Error("Server error"))
    const result = await createTripFromItinerary(ITINERARY_ID, "Galicia Coast")
    expect(result).toEqual({ success: false, error: "Server error" })
  })

  it("returns generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await createTripFromItinerary(ITINERARY_ID, "Galicia Coast")
    expect(result).toEqual({ success: false, error: "Failed to create trip." })
  })
})

describe("generateStoryShare", () => {
  it("posts to the story-share endpoint and returns the updated itinerary", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID, storyShareToken: "tok-abc" })
    const result = await generateStoryShare(ITINERARY_ID)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}/story-share`, {})
    expect(result).toEqual({
      success: true,
      itinerary: { id: ITINERARY_ID, storyShareToken: "tok-abc" },
    })
  })

  it("revalidates /itinerary", async () => {
    mockApiPost.mockResolvedValue({ id: ITINERARY_ID, storyShareToken: "tok-abc" })
    await generateStoryShare(ITINERARY_ID)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
  })

  it("returns an error on failure", async () => {
    mockApiPost.mockRejectedValue(new Error("nope"))
    const result = await generateStoryShare(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "nope" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await generateStoryShare(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Failed to generate share link." })
  })
})

describe("setImagePublic", () => {
  const IMAGE_RESPONSE = {
    id: IMAGE_ID,
    size: 1000,
    name: "cove.jpg",
    location: "https://example.com/cove.jpg",
    isPublic: true,
  }

  it("patches the image visibility endpoint and returns the updated image", async () => {
    mockApiPatch.mockResolvedValue(IMAGE_RESPONSE)
    const result = await setImagePublic(POINT_ID, IMAGE_ID, true)
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/point/${POINT_ID}/images/${IMAGE_ID}`, {
      isPublic: true,
    })
    expect(result).toEqual({ success: true, image: IMAGE_RESPONSE })
  })

  it("returns an error on failure", async () => {
    mockApiPatch.mockRejectedValue(new Error("nope"))
    const result = await setImagePublic(POINT_ID, IMAGE_ID, false)
    expect(result).toEqual({ success: false, error: "nope" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPatch.mockRejectedValue("oops")
    const result = await setImagePublic(POINT_ID, IMAGE_ID, false)
    expect(result).toEqual({
      success: false,
      error: "Failed to update image visibility.",
    })
  })
})

describe("uploadPointImage", () => {
  const IMAGE_RESPONSE = {
    id: IMAGE_ID,
    size: 1000,
    name: "cove.jpg",
    location: "https://example.com/cove.jpg",
    isPublic: false,
  }

  it("uploads the form data to the point's images endpoint and returns the created image", async () => {
    mockApiUpload.mockResolvedValue(IMAGE_RESPONSE)
    const formData = new FormData()
    const result = await uploadPointImage(POINT_ID, formData)
    expect(mockApiUpload).toHaveBeenCalledWith(`/api/point/${POINT_ID}/images`, formData)
    expect(result).toEqual({ success: true, image: IMAGE_RESPONSE })
  })

  it("returns an error on failure", async () => {
    mockApiUpload.mockRejectedValue(new Error("nope"))
    const result = await uploadPointImage(POINT_ID, new FormData())
    expect(result).toEqual({ success: false, error: "nope" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiUpload.mockRejectedValue("oops")
    const result = await uploadPointImage(POINT_ID, new FormData())
    expect(result).toEqual({ success: false, error: "Failed to upload photo." })
  })
})

describe("deletePointImage", () => {
  it("deletes the image at the point's images sub-resource", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    const result = await deletePointImage(POINT_ID, IMAGE_ID)
    expect(mockApiDelete).toHaveBeenCalledWith(`/api/point/${POINT_ID}/images/${IMAGE_ID}`)
    expect(result).toEqual({ success: true })
  })

  it("returns an error on failure", async () => {
    mockApiDelete.mockRejectedValue(new Error("nope"))
    const result = await deletePointImage(POINT_ID, IMAGE_ID)
    expect(result).toEqual({ success: false, error: "nope" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiDelete.mockRejectedValue("oops")
    const result = await deletePointImage(POINT_ID, IMAGE_ID)
    expect(result).toEqual({ success: false, error: "Failed to delete photo." })
  })
})
