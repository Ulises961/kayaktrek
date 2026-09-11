import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchNearbyHazardPositions } from "../actions"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { apiGet, isRedirectError } from "@/lib/api/client"

const GET = apiGet as ReturnType<typeof vi.fn>
const IS_REDIRECT = vi.mocked(isRedirectError)

const positionFixture = {
  id: "01900000-0000-7000-8000-000000000060",
  lat: 50.3,
  lng: -4.1,
  kind: "wind",
}

beforeEach(() => {
  vi.clearAllMocks()
  IS_REDIRECT.mockReturnValue(false)
})

describe("fetchNearbyHazardPositions", () => {
  it("fetches positions with lat/lng/range query params", async () => {
    GET.mockResolvedValue([positionFixture])
    const result = await fetchNearbyHazardPositions(50.3, -4.1, 5)
    expect(GET).toHaveBeenCalledWith("/api/hazard-diamond/nearby?lat=50.3&lng=-4.1&range=5")
    expect(result).toEqual({ success: true, data: [positionFixture] })
  })

  it("returns an error on failure", async () => {
    GET.mockRejectedValue(new Error("Failed to fetch"))
    const result = await fetchNearbyHazardPositions(50.3, -4.1, 5)
    expect(result).toEqual({ success: false, error: "Failed to fetch" })
  })

  it("returns a generic error for non-Error throws", async () => {
    GET.mockRejectedValue("Unknown error")
    const result = await fetchNearbyHazardPositions(50.3, -4.1, 5)
    expect(result).toEqual({ success: false, error: "Failed to fetch nearby hazard positions." })
  })

  it("rethrows a redirect error instead of swallowing it", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    GET.mockRejectedValue(redirectError)
    IS_REDIRECT.mockReturnValue(true)
    await expect(fetchNearbyHazardPositions(50.3, -4.1, 5)).rejects.toBe(redirectError)
  })
})
