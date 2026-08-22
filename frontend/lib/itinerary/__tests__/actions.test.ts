import { describe, it, expect, vi, beforeEach } from "vitest"

const {
  mockApiGet,
  mockApiGetPublic,
  mockApiPost,
  mockApiPatch,
  mockApiDelete,
  mockApiUpload,
  mockIsRedirectError,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiGetPublic: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
  mockApiDelete: vi.fn(),
  mockApiUpload: vi.fn(),
  mockIsRedirectError: vi.fn().mockReturnValue(false),
  mockRevalidatePath: vi.fn(),
}))

vi.mock("@/lib/api/client", () => ({
  apiGet: mockApiGet,
  apiGetPublic: mockApiGetPublic,
  apiPost: mockApiPost,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
  apiUpload: mockApiUpload,
  isRedirectError: mockIsRedirectError,
}))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))

import { DIFFICULTY } from "@/lib/dtos/difficulty"
import {
  createItinerary,
  updateItinerary,
  fetchItineraries,
  createTripFromItinerary,
  createPoint,
  updatePoint,
  deletePoint,
  deleteItinerary,
  createDay,
  updateDay,
  deleteDay,
  assignPointsToDay,
  applyBoundaries,
  forkItinerary,
  importGpx,
  generateStoryShare,
  setImagePublic,
  setImageCaption,
  uploadPointImage,
  deletePointImage,
  searchPublicItineraries,
  fetchPublicItineraryDetail,
  fetchPublicRouteData,
  fetchStoryByToken,
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

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiPost.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(createItinerary({ tripId: TRIP_ID })).rejects.toBe(redirectError)
  })
})

describe("updateItinerary", () => {
  const UPDATED = { id: ITINERARY_ID, name: "Renamed Route", isPublic: true }

  it("patches /api/itinerary/:id with the given fields", async () => {
    mockApiPatch.mockResolvedValue(UPDATED)
    await updateItinerary(ITINERARY_ID, { name: "Renamed Route", isPublic: true })
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}`, {
      name: "Renamed Route",
      isPublic: true,
    })
  })

  it("returns success with the parsed itinerary on success", async () => {
    mockApiPatch.mockResolvedValue(UPDATED)
    const result = await updateItinerary(ITINERARY_ID, { name: "Renamed Route" })
    expect(result).toEqual({ success: true, itinerary: UPDATED })
  })

  it("patches the route's own pitch and grade (M19 §1)", async () => {
    const graded = {
      id: ITINERARY_ID,
      description: "Sheltered coast hop, two easy days.",
      difficulty: DIFFICULTY.MODERATE,
    }
    mockApiPatch.mockResolvedValue(graded)
    const result = await updateItinerary(ITINERARY_ID, {
      description: "Sheltered coast hop, two easy days.",
      difficulty: DIFFICULTY.MODERATE,
    })
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}`, {
      description: "Sheltered coast hop, two easy days.",
      difficulty: DIFFICULTY.MODERATE,
    })
    // Parsed through ItinerarySchema, so the two new fields must survive the round
    // trip — an unlisted key would be stripped and the caller would see it vanish.
    expect(result).toEqual({ success: true, itinerary: graded })
  })

  it("clears the pitch and grade when they are sent as null", async () => {
    mockApiPatch.mockResolvedValue({ id: ITINERARY_ID, description: null, difficulty: null })
    const result = await updateItinerary(ITINERARY_ID, { description: null, difficulty: null })
    expect(result).toEqual({
      success: true,
      itinerary: { id: ITINERARY_ID, description: null, difficulty: null },
    })
  })

  it("revalidates /itinerary on success", async () => {
    mockApiPatch.mockResolvedValue(UPDATED)
    await updateItinerary(ITINERARY_ID, { name: "Renamed Route" })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
  })

  it("returns error result when the API throws", async () => {
    mockApiPatch.mockRejectedValue(new Error("Conflict"))
    const result = await updateItinerary(ITINERARY_ID, { name: "x" })
    expect(result).toEqual({ success: false, error: "Conflict" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPatch.mockRejectedValue("oops")
    const result = await updateItinerary(ITINERARY_ID, { name: "x" })
    expect(result).toEqual({ success: false, error: "Failed to update itinerary." })
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiPatch.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(updateItinerary(ITINERARY_ID, { name: "x" })).rejects.toBe(redirectError)
  })
})

describe("fetchItineraries", () => {
  it("gets /api/itinerary/all and returns the parsed list", async () => {
    mockApiGet.mockResolvedValue([{ id: ITINERARY_ID, name: "Route A" }])
    const result = await fetchItineraries()
    expect(mockApiGet).toHaveBeenCalledWith("/api/itinerary/all")
    expect(result).toEqual([expect.objectContaining({ id: ITINERARY_ID, name: "Route A" })])
  })

  it("returns an empty array when the API throws", async () => {
    mockApiGet.mockRejectedValue(new Error("Server error"))
    const result = await fetchItineraries()
    expect(result).toEqual([])
  })

  it("returns an empty array for non-Error throws", async () => {
    mockApiGet.mockRejectedValue("oops")
    const result = await fetchItineraries()
    expect(result).toEqual([])
  })

  it("rethrows a redirect signal instead of swallowing it into an empty list", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiGet.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(fetchItineraries()).rejects.toBe(redirectError)
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

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiPatch.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(updatePoint(POINT_ID, { type: "stop" })).rejects.toBe(redirectError)
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

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiDelete.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(deletePoint(POINT_ID)).rejects.toBe(redirectError)
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

  it("returns a generic error for non-Error throws", async () => {
    mockApiDelete.mockRejectedValue("oops")
    const result = await deleteItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Failed to delete itinerary." })
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

describe("deleteDay", () => {
  it("sends DELETE to /api/day/:id", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await deleteDay(DAY_ID_2)
    expect(mockApiDelete).toHaveBeenCalledWith(`/api/day/${DAY_ID_2}`)
  })

  it("returns success: true on success", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    const result = await deleteDay(DAY_ID_2)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false with error message on failure", async () => {
    mockApiDelete.mockRejectedValue(new Error("Forbidden"))
    const result = await deleteDay(DAY_ID_2)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiDelete.mockRejectedValue("oops")
    const result = await deleteDay(DAY_ID_2)
    expect(result).toEqual({ success: false, error: "Failed to delete day." })
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiDelete.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(deleteDay(DAY_ID_2)).rejects.toBe(redirectError)
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

describe("forkItinerary", () => {
  it("posts to /api/itinerary/:id/fork", async () => {
    mockApiPost.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    await forkItinerary(ITINERARY_ID)
    expect(mockApiPost).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}/fork`, {})
  })

  it("returns success with the forked itineraryId", async () => {
    mockApiPost.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    const result = await forkItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: true, itineraryId: ITINERARY_ID_2 })
  })

  it("revalidates /itinerary on success", async () => {
    mockApiPost.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    await forkItinerary(ITINERARY_ID)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
  })

  it("returns error result when the API throws", async () => {
    mockApiPost.mockRejectedValue(new Error("Not Found"))
    const result = await forkItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Not Found" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValue("oops")
    const result = await forkItinerary(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Failed to fork itinerary." })
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiPost.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(forkItinerary(ITINERARY_ID)).rejects.toBe(redirectError)
  })
})

describe("importGpx", () => {
  it("uploads the form data to /api/itinerary/import", async () => {
    mockApiUpload.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    const formData = new FormData()
    await importGpx(formData)
    expect(mockApiUpload).toHaveBeenCalledWith("/api/itinerary/import", formData)
  })

  it("returns success with the created itineraryId", async () => {
    mockApiUpload.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    const result = await importGpx(new FormData())
    expect(result).toEqual({ success: true, itineraryId: ITINERARY_ID_2 })
  })

  it("revalidates /itinerary on success", async () => {
    mockApiUpload.mockResolvedValue({ itineraryId: ITINERARY_ID_2 })
    await importGpx(new FormData())
    expect(mockRevalidatePath).toHaveBeenCalledWith("/itinerary")
  })

  it("returns error result when the API throws", async () => {
    mockApiUpload.mockRejectedValue(new Error("Malformed GPX"))
    const result = await importGpx(new FormData())
    expect(result).toEqual({ success: false, error: "Malformed GPX" })
  })

  it("returns a generic error for non-Error throws", async () => {
    mockApiUpload.mockRejectedValue("oops")
    const result = await importGpx(new FormData())
    expect(result).toEqual({ success: false, error: "Failed to import GPX." })
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiUpload.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(importGpx(new FormData())).rejects.toBe(redirectError)
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
})

describe("setImageCaption (M19 §2)", () => {
  const CAPTIONED = {
    id: IMAGE_ID,
    size: 1000,
    name: "cove.jpg",
    location: "https://example.com/cove.jpg",
    isPublic: true,
    caption: "Parking above the slipway",
  }

  it("patches only the caption, leaving visibility untouched", async () => {
    mockApiPatch.mockResolvedValue(CAPTIONED)
    const result = await setImageCaption(POINT_ID, IMAGE_ID, "Parking above the slipway")
    // No isPublic key at all: the endpoint applies only the fields present, so
    // sending one would make captioning a photo silently republish it.
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/point/${POINT_ID}/images/${IMAGE_ID}`, {
      caption: "Parking above the slipway",
    })
    expect(result).toEqual({ success: true, image: CAPTIONED })
  })

  it("clears the caption with null", async () => {
    mockApiPatch.mockResolvedValue({ ...CAPTIONED, caption: null })
    await setImageCaption(POINT_ID, IMAGE_ID, null)
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/point/${POINT_ID}/images/${IMAGE_ID}`, {
      caption: null,
    })
  })

  it("returns the failure shape when the API rejects", async () => {
    mockApiPatch.mockRejectedValue(new Error("too long"))
    const result = await setImageCaption(POINT_ID, IMAGE_ID, "x")
    expect(result).toEqual({ success: false, error: "too long" })
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

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    mockApiUpload.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValueOnce(true)
    await expect(uploadPointImage(POINT_ID, new FormData())).rejects.toBe(redirectError)
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

// The public-fetch group (searchPublicItineraries, fetchPublicItineraryDetail,
// fetchPublicRouteData, fetchStoryByToken) is unauthenticated: it goes through
// apiGetPublic, never apiGet, and its actions correctly do NOT check
// isRedirectError — apiGetPublic has no token/401-retry/redirect path to begin
// with (see lib/api/client.ts). Their failure branch is a bare catch that
// degrades to empty/null data regardless of what was thrown.

describe("searchPublicItineraries", () => {
  const EXPLORE_RESPONSE = {
    items: [{ id: ITINERARY_ID, name: "Coastal Route", dayCount: 3 }],
    total: 1,
    page: 1,
    pages: 1,
  }

  it("gets /api/itinerary/explore with no query string when no filters given", async () => {
    mockApiGetPublic.mockResolvedValue(EXPLORE_RESPONSE)
    await searchPublicItineraries()
    expect(mockApiGetPublic).toHaveBeenCalledWith("/api/itinerary/explore")
  })

  it("builds the query string from name, seasons, mile/day range, bbox, sort and paging", async () => {
    mockApiGetPublic.mockResolvedValue(EXPLORE_RESPONSE)
    await searchPublicItineraries({
      name: " Fjord ",
      seasons: ["summer", "autumn"],
      minMiles: 5,
      maxMiles: 50,
      minDays: 2,
      maxDays: 7,
      bbox: { minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 },
      sort: "distance",
      page: 2,
      perPage: 10,
    })
    const [path] = mockApiGetPublic.mock.calls[0]
    expect(path).toBe(
      "/api/itinerary/explore?name=Fjord&season=summer&season=autumn&minMiles=5&maxMiles=50" +
        "&minDays=2&maxDays=7&minLat=1&minLng=2&maxLat=3&maxLng=4&sort=distance&page=2&per_page=10",
    )
  })

  it("returns the parsed explore page on success", async () => {
    mockApiGetPublic.mockResolvedValue(EXPLORE_RESPONSE)
    const result = await searchPublicItineraries()
    expect(result).toEqual({
      items: [expect.objectContaining({ id: ITINERARY_ID, name: "Coastal Route" })],
      total: 1,
      page: 1,
      pages: 1,
    })
  })

  it("returns an empty page when the API throws", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("Server error"))
    const result = await searchPublicItineraries()
    expect(result).toEqual({ items: [], total: 0, page: 1, pages: 1 })
  })

  it("returns an empty page for non-Error throws too", async () => {
    mockApiGetPublic.mockRejectedValue("oops")
    const result = await searchPublicItineraries()
    expect(result).toEqual({ items: [], total: 0, page: 1, pages: 1 })
  })
})

describe("fetchPublicItineraryDetail", () => {
  const DETAIL_RESPONSE = { id: ITINERARY_ID, name: "Coastal Route", days: [] }

  it("gets /api/itinerary/:id/public and returns the parsed detail", async () => {
    mockApiGetPublic.mockResolvedValue(DETAIL_RESPONSE)
    const result = await fetchPublicItineraryDetail(ITINERARY_ID)
    expect(mockApiGetPublic).toHaveBeenCalledWith(`/api/itinerary/${ITINERARY_ID}/public`)
    expect(result).toEqual(expect.objectContaining({ id: ITINERARY_ID, name: "Coastal Route" }))
  })

  it("returns null when the API throws", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("Not Found"))
    const result = await fetchPublicItineraryDetail(ITINERARY_ID)
    expect(result).toBeNull()
  })

  it("returns null for non-Error throws too", async () => {
    mockApiGetPublic.mockRejectedValue("oops")
    const result = await fetchPublicItineraryDetail(ITINERARY_ID)
    expect(result).toBeNull()
  })
})

describe("fetchPublicRouteData", () => {
  const ROUTE_POINT_ID = "01952f1a-0000-7000-8000-00000000000a"
  const DETAIL_WITH_ROUTE = {
    id: ITINERARY_ID,
    name: "Coastal Route",
    days: [
      {
        dayNumber: 1,
        date: "2026-06-01",
        startPointId: ROUTE_POINT_ID,
        endPointId: ROUTE_POINT_ID,
        points: [
          {
            id: ROUTE_POINT_ID,
            latitude: 51.1,
            longitude: -4.2,
            type: "stop",
            name: "Put-in",
            images: [],
          },
        ],
      },
    ],
  }

  it("returns the extracted route data when the detail fetch succeeds", async () => {
    mockApiGetPublic.mockResolvedValue(DETAIL_WITH_ROUTE)
    const result = await fetchPublicRouteData(ITINERARY_ID)
    expect(result).toMatchObject({
      id: ITINERARY_ID,
      name: "Coastal Route",
      positions: [[51.1, -4.2]],
      dayCount: 1,
    })
  })

  it("returns null without throwing when the detail fetch fails", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("Not Found"))
    const result = await fetchPublicRouteData(ITINERARY_ID)
    expect(result).toBeNull()
  })

  it("returns null when the itinerary has no route data (not found)", async () => {
    mockApiGetPublic.mockResolvedValue(null)
    const result = await fetchPublicRouteData(ITINERARY_ID)
    expect(result).toBeNull()
  })
})

describe("fetchStoryByToken", () => {
  const TOKEN = "story-tok-abc"
  const STORY_RESPONSE = { id: ITINERARY_ID, name: "Our Trip", days: [] }

  it("gets /api/itinerary/story/public/:token and returns the parsed detail", async () => {
    mockApiGetPublic.mockResolvedValue(STORY_RESPONSE)
    const result = await fetchStoryByToken(TOKEN)
    expect(mockApiGetPublic).toHaveBeenCalledWith(`/api/itinerary/story/public/${TOKEN}`)
    expect(result).toEqual(expect.objectContaining({ id: ITINERARY_ID, name: "Our Trip" }))
  })

  it("returns null when the token is invalid/expired", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("Not Found"))
    const result = await fetchStoryByToken(TOKEN)
    expect(result).toBeNull()
  })

  it("returns null for non-Error throws too", async () => {
    mockApiGetPublic.mockRejectedValue("oops")
    const result = await fetchStoryByToken(TOKEN)
    expect(result).toBeNull()
  })
})
