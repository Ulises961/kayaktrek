import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchWindDiamonds,
  createWindDiamond,
  updateWindDiamond,
  repositionWindDiamond,
  deleteWindDiamond,
} from "../actions"
import type { WindDiamondForm } from "@/lib/dtos/wind-diamond"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"

const GET = apiGet as ReturnType<typeof vi.fn>
const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>
const DELETE = apiDelete as ReturnType<typeof vi.fn>
const IS_REDIRECT = vi.mocked(isRedirectError)

const ITINERARY_ID = "01900000-0000-7000-8000-000000000001"

const diamondFixture = {
  id: "01900000-0000-7000-8000-000000000050",
  name: "Funnel off the ridge",
  location: { type: "Point", coordinates: [-4.1, 50.3] },
  notes: "Katabatic gusts reported on NW synoptic flow",
  itineraryId: ITINERARY_ID,
  createdByUserId: "01900000-0000-7000-8000-0000000000aa",
  created: "2026-09-08T00:00:00Z",
}

const form: WindDiamondForm = { name: "Funnel off the ridge", notes: "Katabatic gusts" }

beforeEach(() => {
  vi.clearAllMocks()
  IS_REDIRECT.mockReturnValue(false)
})

describe("fetchWindDiamonds", () => {
  it("fetches the itinerary's wind diamonds", async () => {
    GET.mockResolvedValue([diamondFixture])
    const result = await fetchWindDiamonds(ITINERARY_ID)
    expect(GET).toHaveBeenCalledWith(`/api/wind-diamond/by-itinerary/${ITINERARY_ID}`)
    expect(result).toEqual({ success: true, data: [diamondFixture] })
  })

  it("returns an error on failure", async () => {
    GET.mockRejectedValue(new Error("Failed to fetch"))
    const result = await fetchWindDiamonds(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Failed to fetch" })
  })

  it("returns a generic error for non-Error throws", async () => {
    GET.mockRejectedValue("Unknown error")
    const result = await fetchWindDiamonds(ITINERARY_ID)
    expect(result).toEqual({ success: false, error: "Failed to fetch wind diamonds." })
  })

  it("rethrows a redirect error instead of swallowing it", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    GET.mockRejectedValue(redirectError)
    IS_REDIRECT.mockReturnValue(true)
    await expect(fetchWindDiamonds(ITINERARY_ID)).rejects.toBe(redirectError)
  })
})

describe("createWindDiamond", () => {
  it("posts itineraryId, GeoJSON location and the form body", async () => {
    POST.mockResolvedValue(diamondFixture)
    const result = await createWindDiamond(ITINERARY_ID, 50.3, -4.1, form)
    expect(POST).toHaveBeenCalledWith("/api/wind-diamond/create", {
      itineraryId: ITINERARY_ID,
      location: { type: "Point", coordinates: [-4.1, 50.3] },
      name: "Funnel off the ridge",
      notes: "Katabatic gusts",
    })
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ name: "Funnel off the ridge" }),
    })
  })

  it("returns an error on failure", async () => {
    POST.mockRejectedValue(new Error("Forbidden"))
    const result = await createWindDiamond(ITINERARY_ID, 50.3, -4.1, form)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })

  it("returns a generic error for non-Error throws", async () => {
    POST.mockRejectedValue("Unknown error")
    const result = await createWindDiamond(ITINERARY_ID, 50.3, -4.1, form)
    expect(result).toEqual({ success: false, error: "Failed to create wind diamond." })
  })
})

describe("updateWindDiamond", () => {
  it("patches the editable fields and returns success", async () => {
    PATCH.mockResolvedValue(diamondFixture)
    const result = await updateWindDiamond(diamondFixture.id, { name: "New", notes: null })
    expect(PATCH).toHaveBeenCalledWith(`/api/wind-diamond/${diamondFixture.id}`, {
      name: "New",
      notes: null,
    })
    expect(result).toEqual({ success: true, data: diamondFixture })
  })

  it("returns an error on failure", async () => {
    PATCH.mockRejectedValue(new Error("Forbidden"))
    const result = await updateWindDiamond(diamondFixture.id, { name: "New", notes: null })
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })

  it("returns a generic error for non-Error throws", async () => {
    PATCH.mockRejectedValue("Unknown error")
    const result = await updateWindDiamond(diamondFixture.id, { name: "New", notes: null })
    expect(result).toEqual({ success: false, error: "Failed to update wind diamond." })
  })
})

describe("repositionWindDiamond", () => {
  it("patches only the location as GeoJSON and returns success", async () => {
    PATCH.mockResolvedValue(diamondFixture)
    const result = await repositionWindDiamond(diamondFixture.id, 51.0, -5.0)
    expect(PATCH).toHaveBeenCalledWith(`/api/wind-diamond/${diamondFixture.id}`, {
      location: { type: "Point", coordinates: [-5.0, 51.0] },
    })
    expect(result).toEqual({ success: true, data: diamondFixture })
  })

  it("returns an error on failure", async () => {
    PATCH.mockRejectedValue(new Error("Not found"))
    const result = await repositionWindDiamond(diamondFixture.id, 51.0, -5.0)
    expect(result).toEqual({ success: false, error: "Not found" })
  })

  it("returns a generic error for non-Error throws", async () => {
    PATCH.mockRejectedValue("Unknown error")
    const result = await repositionWindDiamond(diamondFixture.id, 51.0, -5.0)
    expect(result).toEqual({ success: false, error: "Failed to move wind diamond." })
  })
})

describe("deleteWindDiamond", () => {
  it("deletes by id and returns success", async () => {
    DELETE.mockResolvedValue(undefined)
    const result = await deleteWindDiamond(diamondFixture.id)
    expect(DELETE).toHaveBeenCalledWith(`/api/wind-diamond/${diamondFixture.id}`)
    expect(result).toEqual({ success: true })
  })

  it("returns an error on failure", async () => {
    DELETE.mockRejectedValue(new Error("Forbidden"))
    const result = await deleteWindDiamond(diamondFixture.id)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })

  it("returns a generic error for non-Error throws", async () => {
    DELETE.mockRejectedValue("Unknown error")
    const result = await deleteWindDiamond(diamondFixture.id)
    expect(result).toEqual({ success: false, error: "Failed to delete wind diamond." })
  })
})
