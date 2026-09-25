import { describe, it, expect, vi, beforeEach } from "vitest"
import { getPublicProfile } from "../actions"

vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/client")>()),
  apiGetPublic: vi.fn(),
}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("@/lib/auth/actions", () => ({ refreshSession: vi.fn() }))

import { apiGetPublic, ApiError } from "@/lib/api/client"

const GET = apiGetPublic as ReturnType<typeof vi.fn>

const PROFILE = {
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: null,
  bio: null,
  homeLocation: null,
  certifications: [],
  stats: {
    totalDistance: 0,
    totalHours: 0,
    logCount: 0,
    tripCount: 0,
    endorsementsReceived: 0,
    conditionsDistribution: {},
    activityByMonth: [],
  },
}

beforeEach(() => vi.clearAllMocks())

describe("getPublicProfile", () => {
  it("fetches and parses the profile by username", async () => {
    GET.mockResolvedValue(PROFILE)
    const result = await getPublicProfile("seapaddler")
    expect(GET).toHaveBeenCalledWith("/api/user/seapaddler/public")
    expect(result?.username).toBe("seapaddler")
  })

  it("url-encodes the username", async () => {
    GET.mockResolvedValue(PROFILE)
    await getPublicProfile("sea paddler")
    expect(GET).toHaveBeenCalledWith("/api/user/sea%20paddler/public")
  })

  it("returns null on a 404 (no existence oracle)", async () => {
    GET.mockRejectedValue(new ApiError("GET ... failed: 404", 404))
    expect(await getPublicProfile("ghost")).toBeNull()
  })

  it("rethrows a 5xx instead of reporting the profile as missing", async () => {
    const failure = new ApiError("Internal Server Error", 500)
    GET.mockRejectedValue(failure)
    await expect(getPublicProfile("seapaddler")).rejects.toBe(failure)
  })

  it("rethrows a timeout instead of reporting the profile as missing", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError")
    GET.mockRejectedValue(timeout)
    await expect(getPublicProfile("seapaddler")).rejects.toBe(timeout)
  })
})
