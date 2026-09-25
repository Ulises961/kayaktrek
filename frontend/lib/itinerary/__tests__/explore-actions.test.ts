import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockApiGetPublic } = vi.hoisted(() => ({ mockApiGetPublic: vi.fn() }))

vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("@/lib/auth/actions", () => ({ refreshSession: vi.fn() }))
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  apiGet: vi.fn(),
  apiGetPublic: mockApiGetPublic,
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiUpload: vi.fn(),
  isRedirectError: () => false,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { ApiError } from "@/lib/api/client"
import { searchPublicItineraries, fetchPublicRouteData, fetchStoryByToken } from "../actions"
import { TRIP_STATE } from "@/lib/dtos/trip"

const ENVELOPE = { items: [], total: 0, page: 1, pages: 1 }

function lastUrl(): string {
  return mockApiGetPublic.mock.calls.at(-1)![0] as string
}

describe("searchPublicItineraries", () => {
  beforeEach(() => {
    mockApiGetPublic.mockReset()
    mockApiGetPublic.mockResolvedValue(ENVELOPE)
  })

  it("hits the bare endpoint with no filters", async () => {
    await searchPublicItineraries()
    expect(lastUrl()).toBe("/api/itinerary/explore")
  })

  it("repeats the season param per value", async () => {
    await searchPublicItineraries({ seasons: ["summer", "winter"] })
    const url = lastUrl()
    expect(url).toContain("season=summer")
    expect(url).toContain("season=winter")
  })

  it("sends bbox only when all four bounds are present", async () => {
    await searchPublicItineraries({
      bbox: { minLat: 40, minLng: 5, maxLat: 45, maxLng: 12 },
    })
    const url = lastUrl()
    expect(url).toContain("minLat=40")
    expect(url).toContain("maxLng=12")
  })

  it("serialises distance/duration/sort/page", async () => {
    await searchPublicItineraries({
      minMiles: 5,
      maxDays: 4,
      sort: "distance",
      page: 2,
      perPage: 10,
    })
    const url = lastUrl()
    expect(url).toContain("minMiles=5")
    expect(url).toContain("maxDays=4")
    expect(url).toContain("sort=distance")
    expect(url).toContain("page=2")
    expect(url).toContain("per_page=10")
  })

  it("parses the envelope", async () => {
    mockApiGetPublic.mockResolvedValue({
      items: [
        {
          id: "01952f1a-0000-7000-8000-000000000010",
          name: "Loop",
          totalMiles: 10,
          dayCount: 2,
          season: "summer",
          centroidLat: 37,
          centroidLng: 25,
          createdFromId: null,
          originalAuthor: null,
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
    })
    const page = await searchPublicItineraries()
    expect(page.items).toHaveLength(1)
    expect(page.items[0].name).toBe("Loop")
  })

  it("returns an empty envelope on error", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("boom"))
    const page = await searchPublicItineraries({ name: "x" })
    expect(page).toEqual(ENVELOPE)
  })
})

describe("fetchPublicRouteData", () => {
  beforeEach(() => mockApiGetPublic.mockReset())

  it("returns null when the detail is missing or unparseable", async () => {
    mockApiGetPublic.mockResolvedValue(null)
    expect(await fetchPublicRouteData("missing")).toBeNull()
  })

  it("extracts route data from a public detail", async () => {
    mockApiGetPublic.mockResolvedValue({
      id: "01952f1a-0000-7000-8000-000000000010",
      name: "Loop",
      totalMiles: 12,
      days: [
        {
          dayNumber: 1,
          date: "2024-07-01",
          points: [{ id: "p1", latitude: 37, longitude: 25, nextId: null }],
        },
      ],
    })
    const route = await fetchPublicRouteData("01952f1a-0000-7000-8000-000000000010")
    expect(route?.name).toBe("Loop")
    expect(route?.positions).toEqual([[37, 25]])
  })
})

describe("fetchStoryByToken", () => {
  beforeEach(() => mockApiGetPublic.mockReset())

  it("hits the by-token story endpoint", async () => {
    mockApiGetPublic.mockResolvedValue({ id: "it-1", name: "Story", days: [] })
    await fetchStoryByToken("abc123")
    expect(lastUrl()).toBe("/api/itinerary/story/public/abc123")
  })

  it("parses the detail, including tripState", async () => {
    mockApiGetPublic.mockResolvedValue({
      id: "it-1",
      name: "Story",
      tripState: TRIP_STATE.PAST,
      days: [],
    })
    const detail = await fetchStoryByToken("abc123")
    expect(detail?.name).toBe("Story")
    expect(detail?.tripState).toBe(TRIP_STATE.PAST)
  })

  it("returns null for an unknown or regenerated token", async () => {
    mockApiGetPublic.mockRejectedValueOnce(new ApiError("Not found", 404))
    expect(await fetchStoryByToken("gone")).toBeNull()
  })
})
