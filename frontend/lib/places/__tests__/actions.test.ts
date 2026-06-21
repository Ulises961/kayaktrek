import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchPlaceCategories,
  fetchPlaces,
  createPlace,
  updatePlace,
  repositionPlace,
  deletePlace,
} from "../actions"
import type { PlaceForm } from "@/lib/dtos/place"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"

const GET = apiGet as ReturnType<typeof vi.fn>
const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>
const DELETE = apiDelete as ReturnType<typeof vi.fn>
const SESSION = getSession as ReturnType<typeof vi.fn>

const ITINERARY_ID = "01900000-0000-7000-8000-000000000001"
const USER_ID = "01900000-0000-7000-8000-0000000000aa"
const CATEGORY_ID = "01900000-0000-7000-8000-0000000000c0"

const categoryFixture = {
  id: CATEGORY_ID,
  slug: "freshwater",
  name: "Freshwater",
  icon: "droplet",
}

const placeFixture = {
  id: "01900000-0000-7000-8000-000000000040",
  location: { type: "Point", coordinates: [-4.1, 50.3] },
  category: categoryFixture,
  label: "Spring",
  note: "Reliable",
  visibility: "private",
  itineraryId: ITINERARY_ID,
  createdByUserId: USER_ID,
  created: "2026-06-21T00:00:00Z",
}

const form: PlaceForm = { categoryId: CATEGORY_ID, label: "Spring", note: "Reliable" }

beforeEach(() => vi.clearAllMocks())

describe("fetchPlaceCategories", () => {
  it("returns the seeded catalogue", async () => {
    GET.mockResolvedValue([categoryFixture])
    const result = await fetchPlaceCategories()
    expect(GET).toHaveBeenCalledWith("/api/place-categories")
    expect(result).toEqual({ success: true, data: [categoryFixture] })
  })
})

describe("fetchPlaces", () => {
  it("flags places created by the current user as mine", async () => {
    GET.mockResolvedValue([
      placeFixture,
      {
        ...placeFixture,
        id: "01900000-0000-7000-8000-000000000041",
        createdByUserId: "01900000-0000-7000-8000-0000000000bb",
      },
    ])
    SESSION.mockResolvedValue({ userId: USER_ID, email: "a@b.c", isAdmin: false })

    const result = await fetchPlaces(ITINERARY_ID)
    expect(GET).toHaveBeenCalledWith(`/api/place/by-itinerary/${ITINERARY_ID}`)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].mine).toBe(true)
      expect(result.data[1].mine).toBe(false)
    }
  })

  it("treats every place as not-mine when there is no session", async () => {
    GET.mockResolvedValue([placeFixture])
    SESSION.mockResolvedValue(null)
    const result = await fetchPlaces(ITINERARY_ID)
    expect(result.success && result.data[0].mine).toBe(false)
  })
})

describe("createPlace", () => {
  it("posts itineraryId, GeoJSON location and the form body", async () => {
    POST.mockResolvedValue(placeFixture)
    const result = await createPlace(ITINERARY_ID, 50.3, -4.1, form)
    expect(POST).toHaveBeenCalledWith("/api/place/create", {
      itineraryId: ITINERARY_ID,
      location: { type: "Point", coordinates: [-4.1, 50.3] },
      categoryId: CATEGORY_ID,
      label: "Spring",
      note: "Reliable",
    })
    expect(result).toEqual({ success: true, data: expect.objectContaining({ label: "Spring" }) })
  })

  it("returns an error on failure", async () => {
    POST.mockRejectedValue(new Error("Forbidden"))
    const result = await createPlace(ITINERARY_ID, 50.3, -4.1, form)
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })
})

describe("updatePlace", () => {
  it("patches the editable fields", async () => {
    PATCH.mockResolvedValue(placeFixture)
    await updatePlace(placeFixture.id, { categoryId: CATEGORY_ID, label: "New", note: null })
    expect(PATCH).toHaveBeenCalledWith(`/api/place/${placeFixture.id}`, {
      categoryId: CATEGORY_ID,
      label: "New",
      note: null,
    })
  })
})

describe("repositionPlace", () => {
  it("patches only the location as GeoJSON", async () => {
    PATCH.mockResolvedValue(placeFixture)
    await repositionPlace(placeFixture.id, 51.0, -5.0)
    expect(PATCH).toHaveBeenCalledWith(`/api/place/${placeFixture.id}`, {
      location: { type: "Point", coordinates: [-5.0, 51.0] },
    })
  })
})

describe("deletePlace", () => {
  it("deletes by id", async () => {
    DELETE.mockResolvedValue(undefined)
    const result = await deletePlace(placeFixture.id)
    expect(DELETE).toHaveBeenCalledWith(`/api/place/${placeFixture.id}`)
    expect(result).toEqual({ success: true })
  })
})
